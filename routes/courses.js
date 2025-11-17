// routes/courses.js
const express = require("express");
const router = express.Router();
const db = require("../db"); // must be mysql2/promise pool

// Save HOD Data — lookup-or-create course, then upsert related rows
router.post("/", async (req, res) => {
  const conn = await db.getConnection(); // if your db exports pool.getConnection()
  try {
    await conn.beginTransaction();

    const { course, branch, semester, sectionNames = [], subjects = [], teachers = [] } = req.body;

    if (!course || !branch || !semester) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: "Missing course/branch/semester" });
    }

    // 1) Find existing course row (case-insensitive match)
    const [existing] = await conn.query(
      "SELECT id FROM Course WHERE LOWER(course_name)=LOWER(?) AND LOWER(branch_name)=LOWER(?) AND semester=? LIMIT 1",
      [course.trim(), branch.trim(), semester]
    );

    let courseId;
    if (existing.length > 0) {
      courseId = existing[0].id;
      // optionally update course info if changed
      await conn.query(
        "UPDATE Course SET course_name=?, branch_name=?, semester=? WHERE id=?",
        [course.trim(), branch.trim(), semester, courseId]
      );
    } else {
      // create new course
      const [r] = await conn.query(
        "INSERT INTO Course (course_name, branch_name, semester) VALUES (?,?,?)",
        [course.trim(), branch.trim(), semester]
      );
      courseId = r.insertId;
    }

    // 2) Insert Sections: only insert those that are not present
    // Get existing sections for course
    const [existingSections] = await conn.query(
      "SELECT section_label FROM Section WHERE course_id=?",
      [courseId]
    );
    const existingLabels = new Set(existingSections.map(r => r.section_label.toUpperCase()));

    for (let label of sectionNames) {
      const lab = ("" + label).trim().toUpperCase();
      if (!lab) continue;
      if (!existingLabels.has(lab)) {
        await conn.query("INSERT INTO Section (course_id, section_label) VALUES (?,?)", [courseId, lab]);
        existingLabels.add(lab);
      }
    }

    // 3) Insert Subjects: only insert if code (per-course) doesn't exist
    // Ensure we treat subject code uniqueness per course
    const [existingSubjects] = await conn.query(
      "SELECT id, code, name FROM Subject WHERE course_id=?",
      [courseId]
    );
    const subjByCode = {}; // codeUpper -> id
    existingSubjects.forEach(s => { subjByCode[(s.code || "").toUpperCase()] = s.id; });

    const subjectIdMap = {}; // name -> id (for later teacher mapping)
    for (let s of subjects) {
      const name = (s.name || "").trim();
      const code = (s.code || "").trim();
      if (!name || !code) continue;
      const codeUpper = code.toUpperCase();
      if (subjByCode[codeUpper]) {
        // subject exists, update fields (optional)
        const id = subjByCode[codeUpper];
        await conn.query("UPDATE Subject SET name=?, priority=?, type=? WHERE id=?",
                         [name, s.priority || null, s.type || null, id]);
        subjectIdMap[name] = id;
      } else {
        const [r] = await conn.query(
          "INSERT INTO Subject (course_id, name, code, priority, type) VALUES (?,?,?,?,?)",
          [courseId, name, code, s.priority || null, s.type || null]
        );
        subjByCode[codeUpper] = r.insertId;
        subjectIdMap[name] = r.insertId;
      }
    }

    // 4) Insert Teachers and teacher-subject mapping (only if missing)
    // Get current teachers
    const [existingTeachers] = await conn.query("SELECT id, name FROM Teacher");
    const teacherByName = {};
    existingTeachers.forEach(t => teacherByName[(t.name || "").toLowerCase()] = t.id);

    for (let t of teachers) {
      const tName = (t.name || "").trim();
      if (!tName) continue;
      let teacherId = teacherByName[tName.toLowerCase()];
      if (!teacherId) {
        const [tr] = await conn.query("INSERT INTO Teacher (name, email) VALUES (?,?)", [tName, t.email || ""]);
        teacherId = tr.insertId;
        teacherByName[tName.toLowerCase()] = teacherId;
      } else {
        // optional: update email if provided
        if (t.email) await conn.query("UPDATE Teacher SET email=? WHERE id=?", [t.email, teacherId]);
      }

      // map teacher to subject(s)
      const subNames = Array.isArray(t.subjects) ? t.subjects : [];
      for (let subName of subNames) {
        subName = (subName || "").trim();
        if (!subName) continue;
        const sid = subjectIdMap[subName] || null;
        if (!sid) {
          // subject id unknown: try find by name under this course as fallback
          const [sr] = await conn.query("SELECT id FROM Subject WHERE course_id=? AND LOWER(name)=LOWER(?) LIMIT 1", [courseId, subName]);
          if (sr.length > 0) subjectIdMap[subName] = sr[0].id;
        }
        const subjectId = subjectIdMap[subName];
        if (!subjectId) {
          // skip mapping if subject not present (shouldn't happen but safe)
          console.warn(`Skipping mapping: subject "${subName}" not found for course ${courseId}`);
          continue;
        }

        // check if mapping exists
        const [mapRow] = await conn.query("SELECT 1 FROM TeacherSubject WHERE teacher_id=? AND subject_id=? LIMIT 1", [teacherId, subjectId]);
        if (mapRow.length === 0) {
          await conn.query("INSERT INTO TeacherSubject (teacher_id, subject_id) VALUES (?,?)", [teacherId, subjectId]);
        }
      }
    }

    // COMMIT
    await conn.commit();
    conn.release();

    return res.json({ ok: true, courseId });
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    if (conn) conn.release();
    console.error("Error saving course:", err);
    return res.status(500).json({ ok: false, error: err.message });
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
