const express = require("express");
const router = express.Router();
const db = require("../db");

// Save HOD Data
router.post("/", async (req, res) => {
    try {
        const { course, branch, semester, sectionNames, subjects, teachers } = req.body;

        // 1️⃣ CHECK IF COURSE ALREADY EXISTS
        const [existing] = await db.query(
            "SELECT id FROM Course WHERE course_name = ? AND branch_name = ? AND semester = ?",
            [course, branch, semester]
        );

        let courseId;

        if (existing.length > 0) {
            // Course already exists → use old ID
            courseId = existing[0].id;
        } else {
            // 2️⃣ INSERT NEW COURSE
            const [courseResult] = await db.query(
                "INSERT INTO Course (course_name, branch_name, semester) VALUES (?, ?, ?)",
                [course, branch, semester]
            );
            courseId = courseResult.insertId;
        }

        // 3️⃣ Clear old sections/subjects/teachers for this course
        await db.query("DELETE FROM Section WHERE course_id = ?", [courseId]);
        await db.query("DELETE FROM Subject WHERE course_id = ?", [courseId]);
        await db.query(`
            DELETE t FROM Teacher t
            JOIN TeacherSubject ts ON t.id = ts.teacher_id
            JOIN Subject s ON s.id = ts.subject_id
            WHERE s.course_id = ?
        `, [courseId]);
        await db.query("DELETE FROM TeacherSubject WHERE subject_id IN (SELECT id FROM Subject WHERE course_id = ?)", [courseId]);

        // 4️⃣ INSERT SECTIONS
        for (let sec of sectionNames) {
            await db.query("INSERT INTO Section (course_id, section_label) VALUES (?, ?)", [courseId, sec]);
        }

        // 5️⃣ INSERT SUBJECTS
        let subjectMap = {};
        for (let sub of subjects) {
            const [r] = await db.query(
                "INSERT INTO Subject (course_id, name, code, priority, type) VALUES (?,?,?,?,?)",
                [courseId, sub.name, sub.code, sub.priority, sub.type]
            );
            subjectMap[sub.name] = r.insertId;
        }

        // 6️⃣ INSERT TEACHERS + MAPPING
        for (let t of teachers) {
            const [tr] = await db.query("INSERT INTO Teacher (name, email) VALUES (?,?)", [t.name, t.email || ""]);
            const teacherId = tr.insertId;

            for (let s of t.subjects) {
                if (subjectMap[s]) {
                    await db.query(
                        "INSERT INTO TeacherSubject (teacher_id, subject_id) VALUES (?,?)",
                        [teacherId, subjectMap[s]]
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
