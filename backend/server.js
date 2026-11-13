
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";
import twilio from "twilio";
import crypto from "node:crypto";
import argon2 from "argon2";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, query, testDatabase } from "./db.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}
if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32) {
  throw new Error("OTP_SECRET must contain at least 32 characters");
}

if (production && !process.env.APP_URL?.startsWith("https://")) {
  throw new Error("Production requires an HTTPS APP_URL");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgStore = connectPgSimple(session);

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    })
  : null;

const smsClient =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN
    ? twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      )
    : null;

app.set("trust proxy", production ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: "20kb" }));

app.use(session({
  store: new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  name: "myway.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.use("/api", apiLimiter);

function randomOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOTP(code) {
  return crypto
    .createHmac("sha256", process.env.OTP_SECRET)
    .update(code)
    .digest("hex");
}

function verifyOTP(code, storedHash) {
  const actual = Buffer.from(hashOTP(code));
  const expected = Buffer.from(storedHash || "");

  return actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").trim();
}

function validPhone(value) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validText(value, max = 120) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max;
}

async function sendEmailOTP(email, code) {
  if (!transporter) {
    if (!production && process.env.ALLOW_DEV_OTP === "true") {
      console.log("Development email OTP:", code);
      return;
    }
    throw new Error("Email service is not configured");
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "MY WAY verification code",
    text: `Your MY WAY verification code is ${code}. It expires in 10 minutes.`
  });
}

async function sendSMSOTP(phone, code) {
  if (!smsClient || !process.env.TWILIO_PHONE_NUMBER) {
    if (!production && process.env.ALLOW_DEV_OTP === "true") {
      console.log("Development SMS OTP:", code);
      return;
    }
    throw new Error("SMS service is not configured");
  }

  await smsClient.messages.create({
    body: `MY WAY verification code: ${code}. Expires in 10 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

async function loadUser(req, res, next) {
  try {
    const result = await query(
      `SELECT id, first_name, last_name, email, phone, role
       FROM users WHERE id = $1 AND is_active = TRUE`,
      [req.session.userId]
    );

    if (!result.rowCount) {
      return res.status(401).json({ error: "Invalid session" });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== "OWNER") {
    return res.status(403).json({ error: "Owner access required" });
  }
  next();
}

function requireCSRF(req, res, next) {
  const token = req.get("x-csrf-token");

  if (
    !req.session.csrfToken ||
    typeof token !== "string" ||
    token !== req.session.csrfToken
  ) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}

async function audit(userId, action) {
  await query(
    "INSERT INTO audit_logs(user_id, action) VALUES($1, $2)",
    [userId || null, action]
  );
}

async function award(userId, eventKey, xp, coins) {
  const result = await query(
    `INSERT INTO gamification_events(user_id, event_key, xp, coins)
     VALUES($1, $2, $3, $4)
     ON CONFLICT(user_id, event_key) DO NOTHING
     RETURNING id`,
    [userId, eventKey, xp, coins]
  );

  return result.rowCount === 1;
}

// CSRF token for browser clients
app.get("/api/csrf", (req, res) => {
  req.session.csrfToken ??= crypto.randomBytes(32).toString("hex");
  res.json({ csrfToken: req.session.csrfToken });
});

// Registration: send both verification codes
app.post("/api/auth/register", authLimiter, requireCSRF, async (req, res, next) => {
  try {
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (
      !validText(firstName, 80) ||
      !validText(lastName, 80) ||
      !validEmail(email) ||
      !validPhone(phone) ||
      password.length < 12 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: "Check your registration details. Password must be at least 12 characters."
      });
    }

    const duplicate = await query(
      `SELECT 1 FROM users WHERE email = $1 OR phone = $2`,
      [email, phone]
    );

    if (duplicate.rowCount) {
      return res.status(409).json({
        error: "Email or phone is already registered"
      });
    }

    const emailCode = randomOTP();
    const phoneCode = randomOTP();
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });

    await query(
      `DELETE FROM pending_registrations
       WHERE email = $1 OR phone = $2 OR expires_at < NOW()`,
      [email, phone]
    );

    const result = await query(
      `INSERT INTO pending_registrations
       (first_name, last_name, email, phone, password_hash,
        email_otp_hash, phone_otp_hash, expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [
        firstName, lastName, email, phone, passwordHash,
        hashOTP(emailCode), hashOTP(phoneCode)
      ]
    );

    try {
      await Promise.all([
        sendEmailOTP(email, emailCode),
        sendSMSOTP(phone, phoneCode)
      ]);
    } catch (error) {
      await query(
        "DELETE FROM pending_registrations WHERE id = $1",
        [result.rows[0].id]
      );
      throw error;
    }

    res.status(202).json({
      message: "Verification codes sent",
      registrationId: result.rows[0].id
    });
  } catch (error) {
    next(error);
  }
});

// Complete registration after verifying email and phone
app.post("/api/auth/verify-registration", authLimiter, requireCSRF, async (req, res, next) => {
  try {
    const { registrationId, emailCode, phoneCode } = req.body;

    const pending = await query(
      `SELECT * FROM pending_registrations
       WHERE id = $1 AND expires_at > NOW()`,
      [registrationId]
    );

    if (!pending.rowCount) {
      return res.status(400).json({ error: "Registration expired" });
    }

    const item = pending.rows[0];

    if (
      item.attempts >= 5 ||
      !verifyOTP(String(emailCode || ""), item.email_otp_hash) ||
      !verifyOTP(String(phoneCode || ""), item.phone_otp_hash)
    ) {
      await query(
        "UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = $1",
        [registrationId]
      );
      return res.status(400).json({ error: "Invalid verification codes" });
    }

    const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
    const ownerPhone = normalizePhone(process.env.OWNER_PHONE);

    const isOwner =
      ownerEmail &&
      ownerPhone &&
      item.email === ownerEmail &&
      item.phone === ownerPhone;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const created = await client.query(
        `INSERT INTO users
         (first_name, last_name, email, phone, password_hash,
          role, is_email_verified, is_phone_verified)
         VALUES($1,$2,$3,$4,$5,$6,TRUE,TRUE)
         RETURNING id, first_name, last_name, email, phone, role`,
        [
          item.first_name,
          item.last_name,
          item.email,
          item.phone,
          item.password_hash,
          isOwner ? "OWNER" : "USER"
        ]
      );

      await client.query(
        "INSERT INTO user_settings(user_id) VALUES($1)",
        [created.rows[0].id]
      );

      await client.query(
        "DELETE FROM pending_registrations WHERE id = $1",
        [registrationId]
      );

      await client.query("COMMIT");

      await regenerateSession(req);
      req.session.userId = created.rows[0].id;
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");

      await audit(created.rows[0].id, "ACCOUNT_CREATED");

      res.status(201).json({
        message: "Account created",
        user: created.rows[0],
        csrfToken: req.session.csrfToken
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// Login step 1: password
app.post("/api/auth/login", authLimiter, requireCSRF, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const result = await query(
      `SELECT id, password_hash, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    if (
      !result.rowCount ||
      !result.rows[0].is_active ||
      !await argon2.verify(result.rows[0].password_hash, password)
    ) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const userId = result.rows[0].id;

    const user = await query(
      "SELECT email, phone FROM users WHERE id = $1",
      [userId]
    );

    const emailCode = randomOTP();
    const phoneCode = randomOTP();

    const challenge = await query(
      `INSERT INTO login_challenges
       (user_id, email_otp_hash, phone_otp_hash, expires_at)
       VALUES($1,$2,$3,NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [userId, hashOTP(emailCode), hashOTP(phoneCode)]
    );

    try {
      await Promise.all([
        sendEmailOTP(user.rows[0].email, emailCode),
        sendSMSOTP(user.rows[0].phone, phoneCode)
      ]);
    } catch (error) {
      await query(
        "DELETE FROM login_challenges WHERE id = $1",
        [challenge.rows[0].id]
      );
      throw error;
    }

    req.session.loginChallengeId = challenge.rows[0].id;

    res.json({
      requiresTwoFactor: true,
      message: "Check your email and phone"
    });
  } catch (error) {
    next(error);
  }
});

// Login step 2: verify both channels
app.post("/api/auth/verify-login", authLimiter, requireCSRF, async (req, res, next) => {
  try {
    const challengeId = req.session.loginChallengeId;
    const { emailCode, phoneCode } = req.body;

    if (!challengeId) {
      return res.status(400).json({ error: "Login challenge missing" });
    }

    const result = await query(
      `SELECT * FROM login_challenges
       WHERE id = $1 AND expires_at > NOW()
       AND consumed = FALSE`,
      [challengeId]
    );

    if (!result.rowCount) {
      return res.status(400).json({ error: "Challenge expired" });
    }

    const challenge = result.rows[0];

    if (
      challenge.attempts >= 5 ||
      !verifyOTP(String(emailCode || ""), challenge.email_otp_hash) ||
      !verifyOTP(String(phoneCode || ""), challenge.phone_otp_hash)
    ) {
      await query(
        "UPDATE login_challenges SET attempts = attempts + 1 WHERE id = $1",
        [challengeId]
      );
      return res.status(400).json({ error: "Invalid verification codes" });
    }

    const consumed = await query(
      `UPDATE login_challenges SET consumed = TRUE
       WHERE id = $1 AND consumed = FALSE
       RETURNING user_id`,
      [challengeId]
    );

    if (!consumed.rowCount) {
      return res.status(400).json({ error: "Challenge already used" });
    }

    await regenerateSession(req);
    req.session.userId = challenge.user_id;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");

    await audit(challenge.user_id, "LOGIN_SUCCESS");

    res.json({
      message: "Login successful",
      csrfToken: req.session.csrfToken
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", requireCSRF, requireAuth, async (req, res, next) => {
  try {
    await audit(req.session.userId, "LOGOUT");
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie("myway.sid");
      res.json({ message: "Logged out" });
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", requireAuth, loadUser, async (req, res) => {
  const settings = await query(
    "SELECT language, theme, currency FROM user_settings WHERE user_id = $1",
    [req.user.id]
  );

  res.json({
    user: req.user,
    settings: settings.rows[0] || null
  });
});

// Finance
app.get("/api/finance", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, amount, type, category, currency, transaction_date
       FROM finance_transactions
       WHERE user_id = $1
       ORDER BY transaction_date DESC, created_at DESC`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/finance", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    const { title, amount, type, category, currency } = req.body;
    const value = Number(amount);

    if (
      !validText(title, 120) ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 100000000000 ||
      !["income", "expense"].includes(type) ||
      !/^[A-Z]{3}$/.test(currency || "KZT")
    ) {
      return res.status(400).json({ error: "Invalid transaction" });
    }

    const result = await query(
      `INSERT INTO finance_transactions
       (user_id, title, amount, type, category, currency)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        req.session.userId,
        title.trim(),
        value,
        type,
        category || null,
        currency || "KZT"
      ]
    );

    await audit(req.session.userId, "FINANCE_CREATED");
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/finance/:id", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM finance_transactions
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.session.userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    await audit(req.session.userId, "FINANCE_DELETED");
    res.json({ message: "Deleted" });
  } catch (error) {
    next(error);
  }
});

// Goals
app.get("/api/goals", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      "SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC",
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/goals", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    const { title, target, deadline } = req.body;
    const value = Number(target);

    if (!validText(title, 120) || !Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ error: "Invalid goal" });
    }

    const result = await query(
      `INSERT INTO goals(user_id, title, target, deadline)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [req.session.userId, title.trim(), value, deadline || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/goals/:id/progress", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid progress" });
    }

    const result = await query(
      `UPDATE goals SET current = LEAST(target, current + $1)
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [amount, req.params.id, req.session.userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Goal not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Habits
app.get("/api/habits", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT h.*,
       EXISTS (
         SELECT 1 FROM habit_completions c
         WHERE c.habit_id = h.id
         AND c.completed_on = CURRENT_DATE
       ) AS completed_today
       FROM habits h WHERE h.user_id = $1`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/habits", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    if (!validText(req.body.title, 120)) {
      return res.status(400).json({ error: "Invalid habit" });
    }

    const result = await query(
      "INSERT INTO habits(user_id, title) VALUES($1,$2) RETURNING *",
      [req.session.userId, req.body.title.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/habits/:id/complete", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    const habit = await query(
      "SELECT id FROM habits WHERE id = $1 AND user_id = $2",
      [req.params.id, req.session.userId]
    );

    if (!habit.rowCount) {
      return res.status(404).json({ error: "Habit not found" });
    }

    const result = await query(
      `INSERT INTO habit_completions(habit_id)
       VALUES($1) ON CONFLICT(habit_id, completed_on) DO NOTHING
       RETURNING id`,
      [req.params.id]
    );

    if (result.rowCount) {
      await award(
        req.session.userId,
        `habit:${req.params.id}:${new Date().toISOString().slice(0,10)}`,
        20,
        5
      );
    }

    res.json({ completed: true, newlyCompleted: !!result.rowCount });
  } catch (error) {
    next(error);
  }
});

// Tasks
app.get("/api/tasks", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      "SELECT * FROM tasks WHERE user_id = $1 ORDER BY due_date NULLS LAST",
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    if (!validText(req.body.title, 150)) {
      return res.status(400).json({ error: "Invalid task" });
    }

    const result = await query(
      `INSERT INTO tasks(user_id, title, due_date)
       VALUES($1,$2,$3) RETURNING *`,
      [req.session.userId, req.body.title.trim(), req.body.dueDate || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:id/complete", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE tasks SET is_completed = TRUE
       WHERE id = $1 AND user_id = $2 AND is_completed = FALSE
       RETURNING id`,
      [req.params.id, req.session.userId]
    );

    if (result.rowCount) {
      await award(
        req.session.userId,
        `task:${req.params.id}:complete`,
        10,
        2
      );
    }

    res.json({ completed: true, newlyCompleted: !!result.rowCount });
  } catch (error) {
    next(error);
  }
});

// Server-controlled game reward
app.post("/api/games/finance-quiz", requireAuth, requireCSRF, async (req, res, next) => {
  try {
    const correct = Number(req.body.answer) === 0;
    if (!correct) {
      return res.json({ correct: false, reward: null });
    }

    const today = new Date().toISOString().slice(0,10);
    const earned = await award(
      req.session.userId,
      `finance-quiz:${today}`,
      30,
      10
    );

    res.json({
      correct: true,
      reward: earned ? { xp: 30, coins: 10 } : null,
      alreadyPlayed: !earned
    });
  } catch (error) {
    next(error);
  }
});

// Server-calculated balance and AI-style recommendations
app.get("/api/ai/advice", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0) AS income,
        COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expenses
       FROM finance_transactions WHERE user_id = $1`,
      [req.session.userId]
    );

    const income = Number(result.rows[0].income);
    const expenses = Number(result.rows[0].expenses);
    const balance = income - expenses;

    const recommendations = [];

    if (income === 0 && expenses === 0) {
      recommendations.push("Add a few transactions to start your financial analysis.");
    } else if (balance < 0) {
      recommendations.push("Your recorded expenses exceed your recorded income. Review your budget.");
    } else if (income > 0 && expenses / income > 0.8) {
      recommendations.push("Your recorded expenses are above 80% of income. Review your spending categories.");
    } else {
      recommendations.push("Your recorded income currently exceeds your expenses. Consider setting a savings goal.");
    }

    res.json({
      mode: "hybrid-rule-engine",
      totals: { income, expenses, balance },
      recommendations,
      disclaimer: "This is educational guidance, not professional financial advice."
    });
  } catch (error) {
    next(error);
  }
});

// OWNER-only management
app.get("/api/owner/overview",
  requireAuth, loadUser, requireOwner,
  async (req, res, next) => {
    try {
      const [users, transactions, logs] = await Promise.all([
        query("SELECT COUNT(*) FROM users"),
        query("SELECT COUNT(*) FROM finance_transactions"),
        query(
          `SELECT action, created_at FROM audit_logs
           ORDER BY created_at DESC LIMIT 30`
        )
      ]);

      res.json({
        users: Number(users.rows[0].count),
        transactions: Number(transactions.rows[0].count),
        recentActivity: logs.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/owner/users",
  requireAuth, loadUser, requireOwner,
  async (req, res, next) => {
    try {
      const result = await query(
        `SELECT id, first_name, last_name, email, role,
                is_active, created_at
         FROM users ORDER BY created_at DESC LIMIT 200`
      );
      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/health", async (req, res) => {
  try {
    await testDatabase();
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

// Safe error responses
app.use((error, req, res, next) => {
  console.error("Server error:", error.message);
  if (res.headersSent) return next(error);

  res.status(500).json({
    error: "Internal server error"
  });
});

app.listen(PORT, async () => {
  try {
    await testDatabase();
    console.log(`MY WAY server running on port ${PORT}`);
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
});
