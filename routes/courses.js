const express = require("express");
const router = express.Router();
const db = require("../db");

router.post("/", async (req, res) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const { course, branch, semester, sectionNames = [], subjects = [], teachers = [] } = req.body;

    if (!course || !branch || !semester) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: "Missing course/branch/semester" });
    }

    // 1. find or create course
    const [existing] = await conn.query(
      "SELECT id FROM Course WHERE LOWER(course_name)=LOWER(?) AND LOWER(branch_name)=LOWER(?) AND semester=? LIMIT 1",
      [course.trim(), branch.trim(), semester]
    );

    let courseId;
    if (existing.length > 0) {
      courseId = existing[0].id;
    } else {
      const [r] = await conn.query(
        "INSERT INTO Course (course_name, branch_name, semester) VALUES (?,?,?)",
        [course.trim(), branch.trim(), semester]
      );
      courseId = r.insertId;
    }

    // 2. insert new sections
    const [existingSections] = await conn.query(
      "SELECT section_label FROM Section WHERE course_id=?",
      [courseId]
    );
    const existingLabels = new Set(existingSections.map(r => r.section_label.toUpperCase()));

    for (let label of sectionNames) {
      const lab = String(label).trim().toUpperCase();
      if (!lab) continue;
      if (!existingLabels.has(lab)) {
        await conn.query("INSERT INTO Section (course_id, section_label) VALUES (?,?)", [courseId, lab]);
        existingLabels.add(lab);
      }
    }

    // 3. strict: unique subject code per course
    const [existingSubjects] = await conn.query(
      "SELECT id, name, code FROM Subject WHERE course_id=?",
      [courseId]
    );

    const subjByCode = {};
    existingSubjects.forEach(s => subjByCode[(s.code || "").toLowerCase()] = s.id);

    const subjectIdMap = {};

    for (let s of subjects) {
      const name = (s.name || "").trim();
      const code = (s.code || "").trim();
      if (!name || !code) continue;

      // duplicate code check
      const [dup] = await conn.query(
        "SELECT id FROM Subject WHERE course_id=? AND LOWER(code)=LOWER(?)",
        [courseId, code]
      );

      if (dup.length > 0) {
        await conn.rollback();
        return res.status(400).json({
          ok: false,
          error: "This subject code already exists for this course."
        });
      }

      const [r] = await conn.query(
        "INSERT INTO Subject (course_id, name, code, priority, type) VALUES (?,?,?,?,?)",
        [courseId, name, code, s.priority || null, s.type || null]
      );
      subjectIdMap[name] = r.insertId;
    }

    // 4. teachers + mapping
    const [existingTeachers] = await conn.query("SELECT id, name FROM Teacher");
    const teacherByName = {};
    existingTeachers.forEach(t => teacherByName[t.name.toLowerCase()] = t.id);

    for (let t of teachers) {
      const tName = (t.name || "").trim();
      if (!tName) continue;

      let teacherId = teacherByName[tName.toLowerCase()];
      if (!teacherId) {
        const [tr] = await conn.query(
          "INSERT INTO Teacher (name, email) VALUES (?,?)",
          [tName, t.email || ""]
        );
        teacherId = tr.insertId;
        teacherByName[tName.toLowerCase()] = teacherId;
      }

      const subNames = Array.isArray(t.subjects) ? t.subjects : [];
      for (let subName of subNames) {
        subName = (subName || "").trim();
        if (!subName) continue;

        const sid = subjectIdMap[subName];
        if (!sid) continue;

        const [mapRow] = await conn.query(
          "SELECT 1 FROM TeacherSubject WHERE teacher_id=? AND subject_id=? LIMIT 1",
          [teacherId, sid]
        );

        if (mapRow.length === 0) {
          await conn.query(
            "INSERT INTO TeacherSubject (teacher_id, subject_id) VALUES (?,?)",
            [teacherId, sid]
          );
        }
      }
    }

    await conn.commit();
    conn.release();
    return res.json({ ok: true, courseId });

  } catch (err) {
    try { await conn.rollback(); } catch(_) {}
    conn.release();

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ ok: false, error: "This subject code already exists for this course." });
    }

    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
