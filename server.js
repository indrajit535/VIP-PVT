const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// 🔗 API LINK (REPLACE THIS)
const API_URL = "https://your-wingo-api";

// memory
let history = [];
let lastPeriod = null;

// 🔐 Key Generator
function generateKey() {
  return "VIP-" + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// 🧠 Logic 1 (Parity + Flip)
function logic1(a, b) {
  let sum = a + b;
  let base = (sum % 2 === 0) ? "SMALL" : "BIG";
  let last = (b <= 4) ? "SMALL" : "BIG";
  return (base === last) ? (base === "BIG" ? "SMALL" : "BIG") : base;
}

// 🧠 Logic 2 (Trend Reverse)
function logic2(list) {
  let big = 0, small = 0;
  list.slice(0, 5).forEach(i => {
    (i.number <= 4) ? small++ : big++;
  });
  return big > small ? "SMALL" : "BIG";
}

// 🧠 Logic 3 (Streak Break)
function logic3(list) {
  let last = list[0].number <= 4 ? "SMALL" : "BIG";
  let count = 1;

  for (let i = 1; i < list.length; i++) {
    let cur = list[i].number <= 4 ? "SMALL" : "BIG";
    if (cur === last) count++;
    else break;
  }

  if (count >= 3) {
    return last === "BIG" ? "SMALL" : "BIG";
  }

  return last;
}

// 🤖 Final AI (Majority)
function finalPrediction(list) {
  let a = list[1].number;
  let b = list[0].number;

  let p1 = logic1(a, b);
  let p2 = logic2(list);
  let p3 = logic3(list);

  let votes = [p1, p2, p3];
  let big = votes.filter(x => x === "BIG").length;
  let small = votes.filter(x => x === "SMALL").length;

  return big > small ? "BIG" : "SMALL";
}

// 📡 API Route
app.get("/api/predict", async (req, res) => {
  try {
    const response = await axios.get(API_URL);
    const list = response.data.data.list;

    let period = list[0].issueNumber;
    let prediction = finalPrediction(list);

    // history update (no duplicate period)
    if (lastPeriod !== period) {
      history.unshift({
        period,
        prediction,
        actual: list[0].number <= 4 ? "SMALL" : "BIG"
      });

      if (history.length > 20) history.pop();
      lastPeriod = period;
    }

    // 📊 win rate
    let win = 0;
    history.forEach(i => {
      if (i.prediction === i.actual) win++;
    });

    let winrate = history.length
      ? ((win / history.length) * 100).toFixed(1) + "%"
      : "0%";

    res.json({
      period,
      prediction,
      winrate,
      key: generateKey(),
      history
    });

  } catch (err) {
    res.json({ error: "API ERROR" });
  }
});

// root fix
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.listen(PORT, () => {
  console.log("🔥 Server running on port " + PORT);
});