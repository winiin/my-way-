
const translations = {
  ru: {
    dashboard:"Главная", finance:"Финансы", goals:"Цели",
    habits:"Привычки", planner:"Планировщик", games:"Игры",
    achievements:"Достижения", studio:"MY WAY Studio",
    rewards:"Награды", ai:"AI-помощник", settings:"Настройки",
    welcome:"Твой путь начинается здесь",
    balance:"Общий баланс", income:"Доходы",
    expenses:"Расходы", savings:"Накопления",
    add:"Добавить", name:"Название", amount:"Сумма",
    expense:"Расход", incomeType:"Доход",
    newGoal:"Новая цель", progress:"Прогресс",
    newHabit:"Новая привычка", complete:"Выполнено",
    daily:"Ежедневное задание", coins:"MY Coins",
    level:"Уровень", xp:"Опыт", play:"Играть",
    correct:"Правильно!", wrong:"Попробуй ещё раз",
    question:"Какой бюджет помогает контролировать расходы?",
    options:["Личный бюджет","Случайные покупки","Отсутствие плана"],
    quiz:"Финансовая викторина",
    unlocked:"Получено достижение",
    first:"Первый шаг",
    seven:"Семь дней активности",
    save:"Сохранить", theme:"Тема",
    language:"Язык", empty:"Пока ничего нет",
    task:"Задача", date:"Дата",
    greeting:"Добро пожаловать в MY WAY"
  },
  kz: {
    dashboard:"Басты бет", finance:"Қаржы", goals:"Мақсаттар",
    habits:"Әдеттер", planner:"Жоспарлаушы", games:"Ойындар",
    achievements:"Жетістіктер", studio:"MY WAY Studio",
    rewards:"Сыйлықтар", ai:"AI көмекші", settings:"Баптаулар",
    welcome:"Сенің жолың осы жерден басталады",
    balance:"Жалпы баланс", income:"Кіріс",
    expenses:"Шығындар", savings:"Жинақ",
    add:"Қосу", name:"Атауы", amount:"Сома",
    expense:"Шығын", incomeType:"Кіріс",
    newGoal:"Жаңа мақсат", progress:"Прогресс",
    newHabit:"Жаңа әдет", complete:"Орындалды",
    daily:"Күнделікті тапсырма", coins:"MY Coins",
    level:"Деңгей", xp:"Тәжірибе", play:"Ойнау",
    correct:"Дұрыс!", wrong:"Қайталап көр",
    question:"Шығындарды бақылауға не көмектеседі?",
    options:["Жеке бюджет","Кездейсоқ сатып алу","Жоспардың болмауы"],
    quiz:"Қаржылық викторина",
    unlocked:"Жетістік алынды",
    first:"Алғашқы қадам",
    seven:"Жеті күндік белсенділік",
    save:"Сақтау", theme:"Тақырып",
    language:"Тіл", empty:"Әзірге ештеңе жоқ",
    task:"Тапсырма", date:"Күні",
    greeting:"MY WAY-ге қош келдің"
  },
  en: {
    dashboard:"Dashboard", finance:"Finance", goals:"Goals",
    habits:"Habits", planner:"Planner", games:"Games",
    achievements:"Achievements", studio:"MY WAY Studio",
    rewards:"Rewards", ai:"AI Assistant", settings:"Settings",
    welcome:"Your journey starts here",
    balance:"Total balance", income:"Income",
    expenses:"Expenses", savings:"Savings",
    add:"Add", name:"Name", amount:"Amount",
    expense:"Expense", incomeType:"Income",
    newGoal:"New goal", progress:"Progress",
    newHabit:"New habit", complete:"Completed",
    daily:"Daily challenge", coins:"MY Coins",
    level:"Level", xp:"Experience", play:"Play",
    correct:"Correct!", wrong:"Try again",
    question:"What helps control your spending?",
    options:["Personal budget","Random shopping","No plan"],
    quiz:"Financial Quiz",
    unlocked:"Achievement unlocked",
    first:"First Step",
    seven:"Seven Days Active",
    save:"Save", theme:"Theme",
    language:"Language", empty:"Nothing here yet",
    task:"Task", date:"Date",
    greeting:"Welcome to MY WAY"
  }
};

const defaultData = {
  finances: [],
  goals: [],
  habits: [],
  tasks: [],
  xp: 0,
  coins: 0,
  achievements: [],
  completedQuizzes: 0,
  language: "ru",
  theme: "dark",
  username: "My Profile"
};

let data = loadData();
let currentPage = "dashboard";
let quizAnswered = false;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem("myway_data"));
    return saved && typeof saved === "object"
      ? {...defaultData, ...saved}
      : {...defaultData};
  } catch {
    return {...defaultData};
  }
}

function saveData() {
  localStorage.setItem("myway_data", JSON.stringify(data));
  updateHeader();
}

function t(key) {
  return translations[data.language]?.[key] ??
    translations.ru[key] ?? key;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[char]);
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

function updateHeader() {
  document.getElementById("coins").textContent = data.coins;
  document.getElementById("xp").textContent = data.xp;
  document.getElementById("userName").textContent = data.username;

  const level = Math.floor(data.xp / 500) + 1;
  document.getElementById("userLevel").textContent =
    `${t("level")} ${level}`;

  document.getElementById("userName").textContent =
    data.username;
}

function awardXP(amount, coinAmount = 0) {
  data.xp += amount;
  data.coins += coinAmount;
  saveData();
  render();
}

function unlockAchievement(id, rewardXP, rewardCoins) {
  if (data.achievements.includes(id)) return;

  data.achievements.push(id);
  data.xp += rewardXP;
  data.coins += rewardCoins;
  saveData();
  toast(`${t("unlocked")}: ${id}`);
}

function render() {
  updateHeader();

  document.getElementById("pageTitle").textContent = t(currentPage);

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === currentPage
    );
    const label = button.dataset.page;
    button.textContent = navIcon(label) + " " + t(label);
  });

  const content = document.getElementById("content");

  const pages = {
    dashboard: renderDashboard,
    finance: renderFinance,
    goals: renderGoals,
    habits: renderHabits,
    planner: renderPlanner,
    games: renderGames,
    achievements: renderAchievements,
    studio: renderStudio,
    rewards: renderRewards,
    ai: renderAI,
    settings: renderSettings
  };

  content.innerHTML = (pages[currentPage] || renderDashboard)();
  document.getElementById("language").value = data.language;
}

function navIcon(page) {
  const icons = {
    dashboard:"⌂", finance:"◈", goals:"◎",
    habits:"✧", planner:"▦", games:"♧",
    achievements:"🏆", studio:"✦", rewards:"◇",
    ai:"✳", settings:"⚙"
  };
  return icons[page] || "";
}

function renderDashboard() {
  const income = data.finances
    .filter(x => x.type === "income")
    .reduce((sum,x) => sum + x.amount, 0);

  const expenses = data.finances
    .filter(x => x.type === "expense")
    .reduce((sum,x) => sum + x.amount, 0);

  const balance = income - expenses;

  return `
    <h3>${t("welcome")}</h3>
    <p class="muted section">${new Date().toLocaleDateString()}</p>

    <div class="grid section">
      <div class="card">
        <h3>${t("balance")}</h3>
        <div class="stat accent">${balance.toLocaleString()}</div>
      </div>
      <div class="card">
        <h3>${t("income")}</h3>
        <div class="stat green">${income.toLocaleString()}</div>
      </div>
      <div class="card">
        <h3>${t("expenses")}</h3>
        <div class="stat red">${expenses.toLocaleString()}</div>
      </div>
      <div class="card">
        <h3>${t("coins")}</h3>
        <div class="stat">🪙 ${data.coins}</div>
      </div>
    </div>

    <div class="grid section">
      <div class="card">
        <h3>${t("goals")}</h3>
        <div class="stat">${data.goals.length}</div>
        <p class="muted">${t("progress")}</p>
      </div>
      <div class="card">
        <h3>${t("habits")}</h3>
        <div class="stat">${data.habits.length}</div>
      </div>
      <div class="card">
        <h3>${t("achievements")}</h3>
        <div class="stat">${data.achievements.length}</div>
      </div>
      <div class="card">
        <h3>${t("level")}</h3>
        <div class="stat">${Math.floor(data.xp / 500) + 1}</div>
        <p class="muted">${data.xp} XP</p>
      </div>
    </div>
  `;
}

function renderFinance() {
  const income = data.finances
    .filter(x => x.type === "income")
    .reduce((s,x) => s+x.amount,0);

  const expenses = data.finances
    .filter(x => x.type === "expense")
    .reduce((s,x) => s+x.amount,0);

  return `
    <div class="grid">
      <div class="card">
        <h3>${t("income")}</h3>
        <div class="stat green">${income}</div>
      </div>
      <div class="card">
        <h3>${t("expenses")}</h3>
        <div class="stat red">${expenses}</div>
      </div>
    </div>

    <div class="card section">
      <h3>${t("add")} ${t("finance")}</h3>
      <form class="form-row" id="financeForm">
        <input id="financeName" placeholder="${t("name")}" required maxlength="60">
        <input id="financeAmount" type="number" min="0.01" max="1000000000" step="0.01" placeholder="${t("amount")}" required>
        <select id="financeType">
          <option value="income">${t("incomeType")}</option>
          <option value="expense">${t("expense")}</option>
        </select>
        <button class="btn">${t("add")}</button>
      </form>
    </div>

    <div class="card section">
      <h3>${t("finance")}</h3>
      ${data.finances.length ? data.finances.map((x,i) => `
        <div class="item">
          <div>
            <strong>${escapeHTML(x.name)}</strong>
            <small>${x.type === "income" ? t("incomeType") : t("expense")}</small>
          </div>
          <div>
            <strong class="${x.type === "income" ? "green" : "red"}">
              ${x.type === "income" ? "+" : "-"}${x.amount}
            </strong>
            <button class="btn btn-secondary" data-delete-finance="${i}">×</button>
          </div>
        </div>
      `).join("") : t("empty")}
    </div>
  `;
}

function renderGoals() {
  return `
    <div class="card">
      <h3>${t("newGoal")}</h3>
      <form class="form-row" id="goalForm">
        <input id="goalName" placeholder="${t("name")}" required maxlength="60">
        <input id="goalTarget" type="number" min="1" max="1000000000" placeholder="${t("amount")}" required>
        <button class="btn">${t("add")}</button>
      </form>
    </div>
    <div class="section grid">
      ${data.goals.map((g,i) => {
        const progress = Math.min(100, g.current/g.target*100);
        return `
          <div class="card">
            <h3>${escapeHTML(g.name)}</h3>
            <strong>${g.current} / ${g.target}</strong>
            <div class="progress"><div style="width:${progress}%"></div></div>
            <p class="muted">${Math.round(progress)}% ${t("progress")}</p>
            <button class="btn" data-goal="${i}">+ Add progress</button>
          </div>
        `;
      }).join("") || t("empty")}
    </div>
  `;
}

function renderHabits() {
  return `
    <div class="card">
      <h3>${t("newHabit")}</h3>
      <form class="form-row" id="habitForm">
        <input id="habitName" placeholder="${t("name")}" required maxlength="60">
        <button class="btn">${t("add")}</button>
      </form>
    </div>
    <div class="card section">
      ${data.habits.map((h,i) => `
        <div class="item">
          <strong>${escapeHTML(h.name)}</strong>
          <button class="btn ${h.done ? "btn-secondary" : ""}"
            data-habit="${i}">
            ${h.done ? "✓ " + t("complete") : t("complete")}
          </button>
        </div>
      `).join("") || t("empty")}
    </div>
  `;
}

function renderPlanner() {
  return `
    <div class="card">
      <h3>${t("task")}</h3>
      <form class="form-row" id="taskForm">
        <input id="taskName" placeholder="${t("name")}" required maxlength="100">
        <input id="taskDate" type="date" required>
        <button class="btn">${t("add")}</button>
      </form>
    </div>
    <div class="card section">
      ${data.tasks.map((task,i) => `
        <div class="item">
          <div>
            <strong>${escapeHTML(task.name)}</strong>
            <small>${task.date}</small>
          </div>
          <button class="btn btn-secondary" data-task="${i}">✓</button>
        </div>
      `).join("") || t("empty")}
    </div>
  `;
}

function renderGames() {
  return `
    <h3>${t("games")}</h3>
    <div class="grid section">
      <div class="card game-card">
        <div class="game-icon">🧠</div>
        <h3>${t("quiz")}</h3>
        <p class="muted">${t("question")}</p>
        <div class="section">
          ${t("options").map((option,i) => `
            <button class="btn btn-secondary"
              data-answer="${i}" style="margin:4px">
              ${option}
            </button>
          `).join("")}
        </div>
      </div>
      <div class="card game-card">
        <div class="game-icon">💰</div>
        <h3>Money Challenge</h3>
        <p class="muted">Practice managing a virtual budget.</p>
        <button class="btn section" id="moneyGame">Start</button>
      </div>
      <div class="card game-card">
        <div class="game-icon">🧩</div>
        <h3>Daily Brain</h3>
        <p class="muted">Solve a daily logic challenge.</p>
        <button class="btn section" id="brainGame">Start</button>
      </div>
    </div>
  `;
}

function renderAchievements() {
  const list = [
    ["first", "🌟", "First Step"],
    ["quiz", "🧠", "Financial Mind"],
    ["goal", "🎯", "Goal Hunter"],
    ["habit", "🔥", "Habit Builder"],
    ["planner", "📅", "Planner"]
  ];

  return `
    <div class="grid">
      ${list.map(([id,icon,name]) => `
        <div class="card">
          <div class="game-icon">${icon}</div>
          <h3>${name}</h3>
          <span class="badge">
            ${data.achievements.includes(id) ? "✓ Unlocked" : "Locked"}
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStudio() {
  const themes = [
    ["violet","#a78bfa"],
    ["ocean","#55b8e9"],
    ["forest","#55c99b"],
    ["sunset","#f2a46d"]
  ];

  return `
    <div class="card">
      <h3>MY WAY Studio</h3>
      <p class="muted">Customize your personal space.</p>
      <div class="grid section">
        ${themes.map(([name,color]) => `
          <button class="card" data-theme="${name}"
            style="border-color:${color}">
            <div class="game-icon" style="color:${color}">✦</div>
            ${name}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderRewards() {
  const items = [
    ["ocean","Ocean theme",100],
    ["forest","Forest theme",100],
    ["sunset","Sunset theme",150]
  ];

  return `
    <div class="card">
      <h3>MY Coins: ${data.coins}</h3>
      <p class="muted">Use coins to unlock cosmetic themes.</p>
    </div>
    <div class="grid section">
      ${items.map(([id,name,cost]) => `
        <div class="card">
          <h3>${name}</h3>
          <p class="muted">🪙 ${cost}</p>
          <button class="btn" data-buy="${id}" data-cost="${cost}">
            Unlock
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAI() {
  return `
    <div class="card">
      <h3>✳ MY WAY AI</h3>
      <p class="muted">Your personal financial and planning assistant.</p>
      <p class="section">AI connection will be configured through the secure backend.</p>
      <p class="muted">Never enter passwords, bank card details or verification codes in this chat.</p>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="card">
      <h3>${t("settings")}</h3>
      <p class="muted">${t("language")}</p>
      <select id="settingsLanguage">
        <option value="ru">Русский</option>
        <option value="kz">Қазақша</option>
        <option value="en">English</option>
      </select>
      <p class="muted section">${t("theme")}</p>
      <button class="btn" id="settingsTheme">Toggle theme</button>
    </div>
  `;
}

document.getElementById("navigation").addEventListener("click", e => {
  const button = e.target.closest("[data-page]");
  if (!button) return;
  currentPage = button.dataset.page;
  render();
});

document.getElementById("language").addEventListener("change", e => {
  if (!["ru","kz","en"].includes(e.target.value)) return;
  data.language = e.target.value;
  saveData();
  render();
});

document.getElementById("themeButton").addEventListener("click", toggleTheme);

function toggleTheme() {
  document.body.classList.toggle("light");
  data.theme = document.body.classList.contains("light") ? "light" : "dark";
  saveData();
}

document.getElementById("content").addEventListener("submit", e => {
  e.preventDefault();

  if (e.target.id === "financeForm") {
    const name = document.getElementById("financeName").value.trim();
    const amount = Number(document.getElementById("financeAmount").value);
    const type = document.getElementById("financeType").value;

    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    data.finances.push({name,amount,type});
    if (!data.achievements.includes("first")) {
      unlockAchievement("first",50,20);
    }
    saveData();
    render();
    return;
  }

  if (e.target.id === "goalForm") {
    const name = document.getElementById("goalName").value.trim();
    const target = Number(document.getElementById("goalTarget").value);
    if (!name || !Number.isFinite(target) || target <= 0) return;
    data.goals.push({name,target,current:0});
    saveData();
    render();
    return;
  }

  if (e.target.id === "habitForm") {
    const name = document.getElementById("habitName").value.trim();
    if (!name) return;
    data.habits.push({name,done:false});
    saveData();
    render();
    return;
  }

  if (e.target.id === "taskForm") {
    const name = document.getElementById("taskName").value.trim();
    const date = document.getElementById("taskDate").value;
    if (!name || !date) return;
    data.tasks.push({name,date});
    saveData();
    render();
  }
});

document.getElementById("content").addEventListener("click", e => {
  const del = e.target.closest("[data-delete-finance]");
  if (del) {
    data.finances.splice(Number(del.dataset.deleteFinance),1);
    saveData();
    render();
    return;
  }

  const goal = e.target.closest("[data-goal]");
  if (goal) {
    const g = data.goals[Number(goal.dataset.goal)];
    if (!g) return;
    const value = Number(prompt("How much progress?"));
    if (!Number.isFinite(value) || value <= 0) return;
    g.current = Math.min(g.target, g.current + value);
    if (g.current >= g.target) unlockAchievement("goal",100,50);
    else awardXP(10,2);
    saveData();
    render();
    return;
  }

  const habit = e.target.closest("[data-habit]");
  if (habit) {
    const h = data.habits[Number(habit.dataset.habit)];
    if (!h || h.done) return;
    h.done = true;
    awardXP(20,5);
    if (!data.achievements.includes("habit"))
      unlockAchievement("habit",30,10);
    saveData();
    render();
    return;
  }

  const task = e.target.closest("[data-task]");
  if (task) {
    data.tasks.splice(Number(task.dataset.task),1);
    awardXP(10,2);
    if (!data.achievements.includes("planner"))
      unlockAchievement("planner",30,10);
    saveData();
    render();
    return;
  }

  const answer = e.target.closest("[data-answer]");
  if (answer) {
    if (quizAnswered) return;
    quizAnswered = true;

    if (Number(answer.dataset.answer) === 0) {
      toast(t("correct"));
      data.completedQuizzes++;
      awardXP(30,10);
      if (!data.achievements.includes("quiz"))
        unlockAchievement("quiz",50,20);
    } else {
      toast(t("wrong"));
    }

    render();
    return;
  }

  const buy = e.target.closest("[data-buy]");
  if (buy) {
    const id = buy.dataset.buy;
    const cost = Number(buy.dataset.cost);
    if (data.coins < cost) {
      toast("Not enough MY Coins");
      return;
    }
    data.coins -= cost;
    data.unlockedThemes ??= [];
    if (!data.unlockedThemes.includes(id))
      data.unlockedThemes.push(id);
    saveData();
    render();
    return;
  }

  const theme = e.target.closest("[data-theme]");
  if (theme) {
    const id = theme.dataset.theme;
    if (id !== "violet" &&
        !data.unlockedThemes?.includes(id)) {
      toast("Unlock this theme in Rewards first");
      return;
    }
    document.documentElement.dataset.theme = id;
    toast("Theme applied");
    return;
  }

  if (e.target.closest("#moneyGame")) {
    toast("Challenge module is being expanded.");
  }

  if (e.target.closest("#brainGame")) {
    toast("Daily Brain module is being expanded.");
  }

  if (e.target.closest("#settingsTheme")) toggleTheme();

  if (e.target.closest("#settingsLanguage")) {
    const select = document.getElementById("settingsLanguage");
    data.language = select.value;
    saveData();
    render();
  }
});

function init() {
  document.body.classList.toggle("light",data.theme === "light");
  document.documentElement.lang =
    data.language === "kz" ? "kk" : data.language;
  document.getElementById("dateLabel").textContent =
    new Date().toLocaleDateString(
      data.language === "kz" ? "kk-KZ" :
      data.language === "en" ? "en-US" : "ru-RU",
      {weekday:"long",year:"numeric",month:"long",day:"numeric"}
    );

  updateHeader();
  render();
}

init();

const MYWAY_API = {
  csrfToken: null,

  async request(endpoint, options = {}) {
    const method = (options.method || "GET").toUpperCase();

    if (method !== "GET") {
      if (!this.csrfToken) {
        const tokenResponse = await fetch("/api/csrf", {
          credentials: "same-origin"
        });
        const tokenData = await tokenResponse.json();
        this.csrfToken = tokenData.csrfToken;
      }
    }

    const response = await fetch("/api" + endpoint, {
      ...options,
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET"
          ? { "X-CSRF-Token": this.csrfToken }
          : {}),
        ...(options.headers || {})
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Authentication required");
      }
      throw new Error(data.error || "Request failed");
    }

    if (data.csrfToken) {
      this.csrfToken = data.csrfToken;
    }

    return data;
  },

  async getProfile() {
    return this.request("/me");
  },

  async getFinance() {
    return this.request("/finance");
  },

  async addFinance(transaction) {
    return this.request("/finance", {
      method: "POST",
      body: JSON.stringify(transaction)
    });
  },

  async deleteFinance(id) {
    return this.request("/finance/" + encodeURIComponent(id), {
      method: "DELETE"
    });
  },

  async getGoals() {
    return this.request("/goals");
  },

  async createGoal(goal) {
    return this.request("/goals", {
      method: "POST",
      body: JSON.stringify(goal)
    });
  },

  async getHabits() {
    return this.request("/habits");
  },

  async createHabit(habit) {
    return this.request("/habits", {
      method: "POST",
      body: JSON.stringify(habit)
    });
  },

  async completeHabit(id) {
    return this.request(
      "/habits/" + encodeURIComponent(id) + "/complete",
      { method: "POST", body: "{}" }
    );
  },

  async getTasks() {
    return this.request("/tasks");
  },

  async createTask(task) {
    return this.request("/tasks", {
      method: "POST",
      body: JSON.stringify(task)
    });
  },

  async getAIAdvice() {
    return this.request("/ai/advice");
  }
};
