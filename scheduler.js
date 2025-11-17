// =========================
//  CONSTANTS (same as your frontend)
// =========================

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SLOTS = ["8:00-8:55", "8:55-9:50", "10:10-11:05", "11:05-12:00", "12:00-12:55", "12:55-1:50", "2:10-3:05", "3:05-4:00", "4:00-4:55", "4:55-5:50"];

const MAX_CONSECUTIVE_CLASSES = 3;

const PERIOD_REQUIREMENTS = {
    "1": 4,
    "2": 3,
    "3": 2,
    "4": 1
};

const LAB_SLOT_SIZE = 2;


// =========================
//  Helpers
// =========================

// Fisher-Yates shuffle (in-place)
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Create an empty timetable grid (deep)
function createEmptyGrid() {
    const grid = {};
    for (let day of DAYS) {
        grid[day] = Array(SLOTS.length).fill(null);
    }
    return grid;
}

// Check if teacher has conflict
function teacherHasConflict(teacherSchedules, teacherName, day, slot) {
    if (!teacherSchedules[teacherName]) return false;
    return teacherSchedules[teacherName][day][slot] !== null;
}

// Check if section slot occupied
function sectionHasConflict(sectionGrid, day, slot) {
    return sectionGrid[day][slot] !== null;
}

// Check consecutive classes violation for MAX_CONSECUTIVE_CLASSES
function violatesConsecutive(sectionGrid, day, slot) {
    let count = 1;

    // previous slots
    for (let i = slot - 1; i >= 0; i--) {
        if (sectionGrid[day][i] !== null) count++;
        else break;
    }

    // next slots
    for (let i = slot + 1; i < SLOTS.length; i++) {
        if (sectionGrid[day][i] !== null) count++;
        else break;
    }

    return count > MAX_CONSECUTIVE_CLASSES;
}


// =========================
//  Placement: theory subject
//  (tries randomized day/slot order)
// NOTE: added `sectionName` parameter so we can record section in teacherSchedules
// =========================
function placeTheorySubject(sectionGrid, teacherSchedules, subject, teacherName, sectionName) {
    const periodsNeeded = PERIOD_REQUIREMENTS[String(subject.priority)] || 1;
    let placed = 0;

    // make randomized day-slot ordering to get variability across runs
    const daySlotPairs = [];
    for (let d = 0; d < DAYS.length; d++) {
        for (let s = 0; s < SLOTS.length; s++) {
            daySlotPairs.push([d, s]);
        }
    }
    shuffle(daySlotPairs);

    for (const [dayIndex, slotIndex] of daySlotPairs) {
        if (placed >= periodsNeeded) break;

        const day = DAYS[dayIndex];
        if (sectionHasConflict(sectionGrid, day, slotIndex)) continue;
        if (teacherHasConflict(teacherSchedules, teacherName, day, slotIndex)) continue;
        if (violatesConsecutive(sectionGrid, day, slotIndex)) continue;

        // Place subject
        sectionGrid[day][slotIndex] = {
            subject: subject.name,
            teacher: teacherName,
            code: subject.code,
            type: "Theory"
        };

        // record a structured object for teacherSchedules (including section)
        teacherSchedules[teacherName][day][slotIndex] = {
            section: sectionName,
            code: subject.code,
            subject: subject.name,
            type: "Theory"
        };

        placed++;
    }

    return placed >= periodsNeeded;
}


// =========================
//  Placement: lab subject (2 consecutive slots)
//  (tries randomized day, slot order)
// NOTE: added `sectionName` parameter so we can record section in teacherSchedules
// =========================
function placeLab(sectionGrid, teacherSchedules, subject, teacherName, sectionName) {
    const dayOrder = [...Array(DAYS.length).keys()];
    shuffle(dayOrder);

    for (const dayIndex of dayOrder) {
        const day = DAYS[dayIndex];

        // build possible start slots (must fit LAB_SLOT_SIZE)
        const slotStarts = [];
        for (let s = 0; s <= SLOTS.length - LAB_SLOT_SIZE; s++) slotStarts.push(s);
        shuffle(slotStarts);

        for (const slotIndex of slotStarts) {
            // check all required slots free for section and teacher
            let ok = true;
            for (let k = 0; k < LAB_SLOT_SIZE; k++) {
                if (sectionHasConflict(sectionGrid, day, slotIndex + k) ||
                    teacherHasConflict(teacherSchedules, teacherName, day, slotIndex + k)) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;

            // place lab parts
            for (let k = 0; k < LAB_SLOT_SIZE; k++) {
                sectionGrid[day][slotIndex + k] = {
                    subject: subject.name,
                    teacher: teacherName,
                    code: subject.code,
                    type: k === 0 ? `Lab (1/${LAB_SLOT_SIZE})` : `Lab (${k + 1}/${LAB_SLOT_SIZE})`
                };
                // record structured teacherSchedule entries (with section)
                teacherSchedules[teacherName][day][slotIndex + k] = {
                    section: sectionName,
                    code: subject.code,
                    subject: subject.name,
                    type: "Lab"
                };
            }
            return true;
        }
    }

    return false;
}


// =========================
//  TIMETABLE GENERATOR (improved & randomized)
// =========================
function generateTimetable(courseData) {
    const { sectionNames, subjects, teachers } = courseData;

    // build teacherSchedules as fresh grids for this run
    const teacherSchedules = {};
    for (let t of teachers) {
        teacherSchedules[t.name] = createEmptyGrid();
    }

    // final result
    const finalSections = [];

    // We'll process sections in provided order, but we randomize teacher choice and slot search
    for (let section of sectionNames) {
        const sectionGrid = createEmptyGrid();

        // Create subjects copy sorted by priority (lowest number = highest priority)
        // but we also shuffle ties to introduce variability
        const sortedSubjects = [...subjects].sort((a, b) => a.priority - b.priority);

        // for each subject attempt placement
        for (let sub of sortedSubjects) {
            // collect possible teachers for the subject and shuffle order so different teachers are tried first across runs
            const possibleTeachers = teachers.filter(t => t.subjects.includes(sub.name)).map(t => t.name);
            if (possibleTeachers.length === 0) {
                console.warn(`No teachers for subject ${sub.name}`);
                continue;
            }
            shuffle(possibleTeachers);

            let placed = false;
            for (let teacherName of possibleTeachers) {
                if (sub.type && sub.type.toLowerCase().includes("lab")) {
                    placed = placeLab(sectionGrid, teacherSchedules, sub, teacherName, section);
                } else {
                    placed = placeTheorySubject(sectionGrid, teacherSchedules, sub, teacherName, section);
                }
                if (placed) break;
            }

            if (!placed) {
                // Try a second pass: try any teacher (even if not listed) as fallback (optional)
                // (commented out by default; enable if you want more aggressive placement)
                /*
                for (let t of teachers) {
                    if (placeTheorySubject(sectionGrid, teacherSchedules, sub, t.name, section)) {
                        placed = true; break;
                    }
                }
                */
                console.log("Could not place subject:", sub.name);
            }
        }

        finalSections.push({
            sectionName: section,
            timetable: sectionGrid
        });
    }

    return {
        sections: finalSections,
        teacherSchedules
    };
}

module.exports = { generateTimetable };
