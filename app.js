const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const coursesRouter = require("./routes/courses");
const teachersRouter = require("./routes/teachers");
const generateRouter = require("./routes/generate");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/api/courses", coursesRouter);
app.use("/api/teachers", teachersRouter);
app.use("/api/generate", generateRouter);

// ******** IMPORTANT FIX ********
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
