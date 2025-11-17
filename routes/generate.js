const express = require("express");
const router = express.Router();
const db = require("../db");
const { generateTimetable } = require("../scheduler");

// Generate timetable for courseId
router.post("/", async (req, res) => {
    try {
        const { courseId } = req.body;

        if (!courseId)
            return res.json({ ok: false, error: "courseId is required" });

        // ------------ LOAD COURSE ------------
        const [courseRows] = await db.query(
            "SELECT * FROM Course WHERE id = ?",
            [courseId]
        );

        if (courseRows.length === 0)
            return res.json({ ok: false, error: "Invalid courseId" });

        // ------------ LOAD SECTIONS ------------
        const [sections] = await db.query(
            "SELECT section_label FROM Section WHERE course_id=?",
            [courseId]
        );

        // ------------ LOAD SUBJECTS ------------
        const [subjects] = await db.query(
            "SELECT id, name, code, priority, type FROM Subject WHERE course_id=?",
            [courseId]
        );

        // ------------ LOAD TEACHERS + SUBJECT MAPPING ------------
        const [teacherRows] = await db.query(
            `SELECT 
                t.name AS teacherName,
                s.name AS subjectName
             FROM Teacher t
             JOIN TeacherSubject ts ON ts.teacher_id = t.id
             JOIN Subject s ON s.id = ts.subject_id
             WHERE s.course_id=?`,
            [courseId]
        );

        // FORMAT TEACHERS
        const teacherMap = {};
        teacherRows.forEach(r => {
            if (!teacherMap[r.teacherName]) {
                teacherMap[r.teacherName] = [];
            }
            teacherMap[r.teacherName].push(r.subjectName);
        });

        const teacherList = Object.entries(teacherMap).map(([name, subjects]) => ({
            name,
            subjects
        }));

        // ------------- PREPARE DATA FOR SCHEDULER -------------
        const courseData = {
            sectionNames: sections.map(s => s.section_label),
            subjects,
            teachers: teacherList
        };

        // ------------- GENERATE FINAL TIMETABLE -------------
        const generated = generateTimetable(courseData);

        // ------------- SAVE TO DB -------------
        await db.query(
            "INSERT INTO GeneratedTimetable (course_id, data) VALUES (?, ?)",
            [courseId, JSON.stringify(generated)]
        );

        // RETURN TO FRONTEND
        res.json({ ok: true, timetable: generated });

    } catch (err) {
        console.error("Timetable generation error:", err);
        res.json({ ok: false, error: err.message });
    }
});

module.exports = router;
