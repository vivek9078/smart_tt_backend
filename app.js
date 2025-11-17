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

app.listen(process.env.PORT, () => {
    console.log("Server running on port", process.env.PORT);
});
