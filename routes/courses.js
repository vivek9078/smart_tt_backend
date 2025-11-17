const express = require("express");
const router = express.Router();
const db = require("../db");

// Save HOD Data
router.post("/", async (req, res) => {
    try {
        const { course, branch, semester, sectionNames, subjects, teachers } = req.body;

        // Insert Course
        const [courseResult] = await db.query(
            "INSERT INTO Course (course_name, branch_name, semester) VALUES (?, ?, ?)",
            [course, branch, semester]
        );
        const courseId = courseResult.insertId;

        // Insert Sections
        for (let sec of sectionNames) {
            await db.query("INSERT INTO Section (course_id, section_label) VALUES (?, ?)", [courseId, sec]);
        }

        // Insert Subjects
     // Insert Subjects
let subjectMap = {};
for (let sub of subjects) {

    // 🔥 CHECK FOR DUPLICATE CODE IN SAME COURSE
    const [existing] = await db.query(
        "SELECT id FROM Subject WHERE course_id = ? AND code = ?",
        [courseId, sub.code]
    );

    if (existing.length > 0) {
        return res.json({
            ok: false,
            error: `Duplicate subject code "${sub.code}" already exists for this course`
        });
    }

    // If not duplicate, insert
    const [r] = await db.query(
        "INSERT INTO Subject (course_id, name, code, priority, type) VALUES (?,?,?,?,?)",
        [courseId, sub.name, sub.code, sub.priority, sub.type]
    );
    subjectMap[sub.name] = r.insertId;
}


        // Insert Teachers + Mapping
        for (let t of teachers) {
            const [tr] = await db.query("INSERT INTO Teacher (name, email) VALUES (?,?)", [t.name, t.email || ""]);
            const teacherId = tr.insertId;

            for (let subjectName of t.subjects) {
                if (subjectMap[subjectName]) {
                    await db.query(
                        "INSERT INTO TeacherSubject (teacher_id, subject_id) VALUES (?,?)",
                        [teacherId, subjectMap[subjectName]]
                    );
                }
            }
        }

        res.json({ ok: true, courseId });

    } catch (err) {
        console.error(err);
        res.json({ ok: false, error: err.message });
    }
});

// Get all courses
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, course_name, branch_name, semester FROM Course");
        res.json(rows);
    } catch (err) {
        console.error("Error fetching courses:", err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});


module.exports = router;
