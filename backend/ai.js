
app.get("/api/ai/advice", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
        COALESCE(SUM(amount) FILTER (WHERE type='income'),0) AS income,
        COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) AS expenses
       FROM finance_transactions WHERE user_id=$1`,
      [req.session.userId]
    );

    const income = Number(result.rows[0].income);
    const expenses = Number(result.rows[0].expenses);
    const balance = income - expenses;

    let recommendation;

    if (!income && !expenses) {
      recommendation = "Add transactions to begin tracking your budget.";
    } else if (balance < 0) {
      recommendation = "Recorded expenses exceed recorded income. Review your budget.";
    } else if (income && expenses / income > 0.8) {
      recommendation = "Expenses exceed 80% of recorded income.";
    } else {
      recommendation = "Your recorded income exceeds expenses. Consider a savings goal.";
    }

    let aiExplanation = null;
    let mode = "rule-engine";

    if (
      process.env.AI_API_KEY &&
      process.env.AI_API_URL &&
      process.env.AI_MODEL
    ) {
      const response = await fetch(
        process.env.AI_API_URL.replace(/\/$/, "") + "/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.AI_API_KEY}`
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL,
            messages: [
              {
                role: "system",
                content: "You are MY WAY, an educational financial literacy assistant. Give cautious, clear and age-appropriate budgeting guidance. Never request passwords, bank credentials or verification codes. Do not claim to execute financial transactions."
              },
              {
                role: "user",
                content: JSON.stringify({
                  income,
                  expenses,
                  balance,
                  localRecommendation: recommendation
                })
              }
            ],
            temperature: 0.3
          }),
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error("AI provider unavailable");
      }

      const resultAI = await response.json();
      aiExplanation =
        resultAI.choices?.[0]?.message?.content || null;

      if (aiExplanation) mode = "hybrid";
    }

    res.json({
      mode,
      totals: { income, expenses, balance },
      recommendation,
      aiExplanation,
      disclaimer: "Educational information, not professional financial advice."
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/gamification", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId;

    const totals = await query(
      `SELECT
        COALESCE(SUM(xp),0) AS xp,
        COALESCE(SUM(coins),0) AS coins
       FROM gamification_events
       WHERE user_id=$1`,
      [userId]
    );

    const achievements = await query(
      `SELECT achievement_code, unlocked_at
       FROM user_achievements
       WHERE user_id=$1
       ORDER BY unlocked_at DESC`,
      [userId]
    );

    const xp = Number(totals.rows[0].xp);

    res.json({
      xp,
      coins: Number(totals.rows[0].coins),
      level: Math.floor(xp / 500) + 1,
      nextLevelXP: 500 - (xp % 500),
      achievements: achievements.rows
    });
  } catch (error) {
    next(error);
  }
});
