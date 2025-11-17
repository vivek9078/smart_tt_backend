const express = require("express");
const router = express.Router();
const db = require("../db");
const { generateTimetable } = require("../scheduler");

router.post("/", async (req, res) => {
    try {
        const { courseId } = req.body;

        // Load course data from DB
        const [sections] = await db.query("SELECT section_label FROM Section WHERE course_id=?", [courseId]);
        const [subjects] = await db.query("SELECT name, code, priority, type FROM Subject WHERE course_id=?", [courseId]);
        const [teacherRows] = await db.query(
            `SELECT t.name, s.name AS subject 
             FROM Teacher t 
             JOIN TeacherSubject ts ON t.id = ts.teacher_id
             JOIN Subject s ON s.id = ts.subject_id
             WHERE s.course_id=?`,
             [courseId]
        );

        // Format teachers
        const teacherMap = {};
        teacherRows.forEach(r => {
            if (!teacherMap[r.name]) teacherMap[r.name] = [];
            teacherMap[r.name].push(r.subject);
        });
        const teacherList = Object.entries(teacherMap).map(([name, subjects]) => ({
            name,
            subjects
        }));

        const courseData = {
            sectionNames: sections.map(s => s.section_label),
            subjects: subjects,
            teachers: teacherList
        };

        const result = generateTimetable(courseData);

        // Store result
        await db.query(
            "INSERT INTO GeneratedTimetable (course_id, data) VALUES (?,?)",
            [courseId, JSON.stringify(result)]
        );

        res.json({ ok: true, timetable: result });

    } catch (err) {
        console.error(err);
        res.json({ ok: false, error: err.message });
    }
});

module.exports = router;
