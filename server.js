const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// static folder
app.use(express.static(path.join(__dirname, "public")));

// API route
app.get("/api/predict", (req, res) => {
  const random = Math.random();
  let result = random > 0.5 ? "BIG" : "SMALL";

  res.json({
    prediction: result,
    time: new Date()
  });
});

// root fix
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
