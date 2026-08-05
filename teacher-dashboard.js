import {
  db,
  ensureFirebaseLogin,
  serverTimestamp
} from "./firebase-config.js?v=20260805-master-debug";

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteField
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";


/* =========================================================
   TETAPAN SISTEM
========================================================= */

const SESSION_KEY =
  "c01_master_teacher_session_v1";

const PIN_KEY =
  "c01_master_teacher_pin_v1";

const SUPPORTED_MODULES = [
  "KT13",
  "KT14",
  "KT15"
];


/* =========================================================
   DATA SEMENTARA
========================================================= */

let students = [];

let assessmentsByStudent =
  new Map();

let studentListeners =
  new Map();

let unsubscribeStudents =
  null;


/* =========================================================
   ELEMEN HTML
========================================================= */

const teacherGreeting =
  document.getElementById(
    "teacherGreeting"
  );

const connectionStatus =
  document.getElementById(
    "connectionStatus"
  );

const totalStudents =
  document.getElementById(
    "totalStudents"
  );

const totalPending =
  document.getElementById(
    "totalPending"
  );

const totalCompetent =
  document.getElementById(
    "totalCompetent"
  );

const totalFailed =
  document.getElementById(
    "totalFailed"
  );

const overallAverage =
  document.getElementById(
    "overallAverage"
  );

const kt13Average =
  document.getElementById(
    "kt13Average"
  );

const kt14Average =
  document.getElementById(
    "kt14Average"
  );

const kt15Average =
  document.getElementById(
    "kt15Average"
  );

const kt13Count =
  document.getElementById(
    "kt13Count"
  );

const kt14Count =
  document.getElementById(
    "kt14Count"
  );

const kt15Count =
  document.getElementById(
    "kt15Count"
  );

const searchInput =
  document.getElementById(
    "searchInput"
  );

const moduleFilter =
  document.getElementById(
    "moduleFilter"
  );

const statusFilter =
  document.getElementById(
    "statusFilter"
  );

const studentTable =
  document.getElementById(
    "studentTable"
  );

const rankingList =
  document.getElementById(
    "rankingList"
  );


/* =========================================================
   MULA DASHBOARD
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialiseDashboard
);

async function initialiseDashboard() {
  const session =
    requireTeacherSession();

  if (!session) {
    return;
  }

  teacherGreeting.textContent =
    `Selamat datang, ${session.name}`;

  bindControls();

  setConnectionStatus(
    "MENYAMBUNG...",
    "connecting"
  );

  showLoadingState();

  try {
    await ensureFirebaseLogin();

    startRealtimeStudents();

  } catch (error) {
    showFirebaseError(
      "Firebase Authentication gagal",
      error
    );
  }
}


/* =========================================================
   SEMAK SESI PEGAWAI PENILAI
========================================================= */

function requireTeacherSession() {
  try {
    const session =
      JSON.parse(
        sessionStorage.getItem(
          SESSION_KEY
        ) || "null"
      );

    if (!session?.name) {
      window.location.href =
        "login.html";

      return null;
    }

    return session;

  } catch (error) {
    window.location.href =
      "login.html";

    return null;
  }
}


/* =========================================================
   KAWALAN BUTANG
========================================================= */

function bindControls() {
  const refreshButton =
    document.getElementById(
      "refreshButton"
    );

  const csvButton =
    document.getElementById(
      "csvButton"
    );

  const backupButton =
    document.getElementById(
      "backupButton"
    );

  const changePinButton =
    document.getElementById(
      "changePinButton"
    );

  const logoutButton =
    document.getElementById(
      "logoutButton"
    );

  refreshButton?.addEventListener(
    "click",
    restartRealtime
  );

  csvButton?.addEventListener(
    "click",
    exportCsv
  );

  backupButton?.addEventListener(
    "click",
    exportJson
  );

  changePinButton?.addEventListener(
    "click",
    changePin
  );

  logoutButton?.addEventListener(
    "click",
    logoutTeacher
  );

  searchInput?.addEventListener(
    "input",
    renderDashboard
  );

  moduleFilter?.addEventListener(
    "change",
    renderDashboard
  );

  statusFilter?.addEventListener(
    "change",
    renderDashboard
  );
}


/* =========================================================
   PAPAR STATUS MEMUATKAN
========================================================= */

function showLoadingState() {
  studentTable.innerHTML = `
    <div class="empty-state">
      <h3>Sedang memuatkan rekod...</h3>
      <p>
        Menyambung kepada Firebase Firestore.
      </p>
    </div>
  `;

  rankingList.innerHTML = `
    <div class="empty-state">
      <p>
        Ranking sedang dimuatkan.
      </p>
    </div>
  `;
}


/* =========================================================
   FIREBASE REALTIME — SENARAI PELATIH
========================================================= */

function startRealtimeStudents() {
  stopRealtime();

  setConnectionStatus(
    "MENYAMBUNG...",
    "connecting"
  );

  const studentsQuery =
    query(
      collection(
        db,
        "students"
      ),
      orderBy("name")
    );

  unsubscribeStudents =
    onSnapshot(
      studentsQuery,

      snapshot => {
        students =
          snapshot.docs.map(
            studentDocument => ({
              uid:
                studentDocument.id,

              ...studentDocument.data()
            })
          );

        synchroniseStudentListeners();

        setConnectionStatus(
          "REALTIME AKTIF",
          "online"
        );

        renderDashboard();
      },

      error => {
        showFirebaseError(
          "Senarai pelatih gagal dibaca",
          error
        );
      }
    );
}


/* =========================================================
   FIREBASE REALTIME — MARKAH SETIAP PELATIH
========================================================= */

function synchroniseStudentListeners() {
  const currentStudentUids =
    new Set(
      students.map(
        student =>
          student.uid
      )
    );

  for (
    const [
      uid,
      unsubscribe
    ]
    of studentListeners.entries()
  ) {
    if (
      !currentStudentUids.has(uid)
    ) {
      unsubscribe();

      studentListeners.delete(
        uid
      );

      assessmentsByStudent.delete(
        uid
      );
    }
  }

  students.forEach(student => {
    if (
      studentListeners.has(
        student.uid
      )
    ) {
      return;
    }

    const assessmentQuery =
      query(
        collection(
          db,
          "students",
          student.uid,
          "assessments"
        ),
        orderBy("missionId")
      );

    const unsubscribe =
      onSnapshot(
        assessmentQuery,

        snapshot => {
          const assessments =
            snapshot.docs.map(
              assessmentDocument => ({
                id:
                  assessmentDocument.id,

                ...assessmentDocument.data()
              })
            );

          assessmentsByStudent.set(
            student.uid,
            assessments
          );

          renderDashboard();
        },

        error => {
          showFirebaseError(
            `Rekod ${student.name || "pelatih"} gagal dibaca`,
            error
          );
        }
      );

    studentListeners.set(
      student.uid,
      unsubscribe
    );
  });
}


/* =========================================================
   PAPAR RALAT FIREBASE TERUS PADA SKRIN
========================================================= */

function showFirebaseError(
  title,
  error
) {
  console.error(
    title,
    error
  );

  const errorCode =
    error?.code ||
    "tiada-kod";

  const errorMessage =
    error?.message ||
    String(error);

  setConnectionStatus(
    "RALAT FIREBASE",
    "error"
  );

  studentTable.innerHTML = `
    <div
      style="
        padding:24px;
        border:3px solid #fb7185;
        border-radius:18px;
        background:rgba(159,18,57,0.24);
        color:#ffffff;
      "
    >
      <h2 style="color:#fb7185">
        ⚠️ ${escapeHtml(title)}
      </h2>

      <p>
        <strong>Kod ralat:</strong>
        ${escapeHtml(errorCode)}
      </p>

      <p>
        <strong>Mesej:</strong>
        ${escapeHtml(errorMessage)}
      </p>

      <hr
        style="
          border:0;
          border-top:1px solid #fb7185;
          margin:18px 0;
        "
      >

      <p>
        Jika kod ralat ialah
        <strong>permission-denied</strong>,
        semak Firestore Rules.
      </p>

      <button
        class="secondary-button"
        type="button"
        onclick="window.location.reload()"
      >
        CUBA SEMULA
      </button>
    </div>
  `;

  rankingList.innerHTML = `
    <div class="empty-state">
      <p>
        Ranking tidak dapat dimuatkan kerana berlaku ralat Firebase.
      </p>
    </div>
  `;

  window.alert(
    `${title}\n\nKod: ${errorCode}\n\n${errorMessage}`
  );
}


/* =========================================================
   MUAT SEMULA REALTIME
========================================================= */

function restartRealtime() {
  showLoadingState();

  startRealtimeStudents();

  showToast(
    "Dashboard sedang dimuat semula."
  );
}


/* =========================================================
   HENTIKAN LISTENER
========================================================= */

function stopRealtime() {
  if (unsubscribeStudents) {
    unsubscribeStudents();

    unsubscribeStudents =
      null;
  }

  for (
    const unsubscribe
    of studentListeners.values()
  ) {
    unsubscribe();
  }

  studentListeners.clear();
}


/* =========================================================
   BINA SENARAI REKOD
========================================================= */

function createAssessmentRecords() {
  const records = [];

  students.forEach(student => {
    const assessments =
      assessmentsByStudent.get(
        student.uid
      ) || [];

    const supportedAssessments =
      assessments.filter(
        assessment =>
          SUPPORTED_MODULES.includes(
            getModuleCode(
              assessment
            )
          )
      );

    if (
      supportedAssessments.length === 0
    ) {
      records.push({
        student,
        assessment:
          null,

        module:
          "BELUM DINILAI",

        status:
          "BELUM_DINILAI",

        score:
          null
      });

      return;
    }

    supportedAssessments.forEach(
      assessment => {
        records.push({
          student,

          assessment,

          module:
            getModuleCode(
              assessment
            ),

          status:
            normalizeStatus(
              assessment
            ),

          score:
            getNumericScore(
              assessment.score
            )
        });
      }
    );
  });

  return records;
}


/* =========================================================
   KENAL PASTI KOD MODUL
========================================================= */

function getModuleCode(
  assessment
) {
  if (
    assessment?.ktCode
  ) {
    return String(
      assessment.ktCode
    ).toUpperCase();
  }

  if (
    assessment?.missionId
  ) {
    return `KT${assessment.missionId}`;
  }

  if (
    assessment?.id
  ) {
    return String(
      assessment.id
    ).toUpperCase();
  }

  return "KT";
}


/* =========================================================
   TUKAR MARKAH KEPADA NOMBOR
========================================================= */

function getNumericScore(
  value
) {
  const score =
    Number(value);

  return Number.isFinite(
    score
  )
    ? score
    : null;
}


/* =========================================================
   TENTUKAN STATUS
========================================================= */

function normalizeStatus(
  assessment
) {
  if (!assessment) {
    return "BELUM_DINILAI";
  }

  const score =
    getNumericScore(
      assessment.score
    ) || 0;

  if (
    assessment.official === true &&
    assessment.locked === true
  ) {
    return (
      score >= 60
        ? "TERAMPIL"
        : "BELUM_TERAMPIL"
    );
  }

  const savedStatus =
    String(
      assessment.status || ""
    )
      .toUpperCase()
      .replaceAll(
        " ",
        "_"
      );

  if (
    savedStatus ===
    "MENUNGGU_PENGESAHAN"
  ) {
    return savedStatus;
  }

  if (
    savedStatus ===
    "TERAMPIL"
  ) {
    return savedStatus;
  }

  if (
    savedStatus ===
    "BELUM_TERAMPIL"
  ) {
    return savedStatus;
  }

  return (
    score >= 60
      ? "MENUNGGU_PENGESAHAN"
      : "BELUM_TERAMPIL"
  );
}


/* =========================================================
   TAPIS REKOD
========================================================= */

function getFilteredRecords() {
  const keyword =
    searchInput.value
      .trim()
      .toLowerCase();

  const selectedModule =
    moduleFilter.value;

  const selectedStatus =
    statusFilter.value;

  return createAssessmentRecords()
    .filter(record => {
      const searchText = [
        record.student.name,
        record.student.studentId,
        record.module
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword ||
        searchText.includes(
          keyword
        );

      const matchesModule =
        selectedModule === "ALL" ||
        record.module ===
          selectedModule;

      const matchesStatus =
        selectedStatus === "ALL" ||
        record.status ===
          selectedStatus;

      return (
        matchesSearch &&
        matchesModule &&
        matchesStatus
      );
    });
}


/* =========================================================
   PAPAR SEMUA DASHBOARD
========================================================= */

function renderDashboard() {
  const records =
    createAssessmentRecords();

  const filteredRecords =
    getFilteredRecords();

  renderStatistics(
    records
  );

  renderModuleSummary(
    records
  );

  renderStudentTable(
    filteredRecords
  );

  renderRanking(
    records
  );
}


/* =========================================================
   STATISTIK UTAMA
========================================================= */

function renderStatistics(
  records
) {
  totalStudents.textContent =
    students.length;

  totalPending.textContent =
    records.filter(
      record =>
        record.status ===
        "MENUNGGU_PENGESAHAN"
    ).length;

  totalCompetent.textContent =
    records.filter(
      record =>
        record.status ===
        "TERAMPIL"
    ).length;

  totalFailed.textContent =
    records.filter(
      record =>
        record.status ===
        "BELUM_TERAMPIL"
    ).length;

  const scoredRecords =
    records.filter(
      record =>
        Number.isFinite(
          record.score
        )
    );

  const average =
    scoredRecords.length
      ? scoredRecords.reduce(
          (
            total,
            record
          ) =>
            total +
            record.score,
          0
        ) /
        scoredRecords.length
      : 0;

  overallAverage.textContent =
    `${average.toFixed(1)}%`;
}


/* =========================================================
   PURATA SETIAP MODUL
========================================================= */

function renderModuleSummary(
  records
) {
  updateModuleCard(
    records,
    "KT13",
    kt13Average,
    kt13Count
  );

  updateModuleCard(
    records,
    "KT14",
    kt14Average,
    kt14Count
  );

  updateModuleCard(
    records,
    "KT15",
    kt15Average,
    kt15Count
  );
}

function updateModuleCard(
  records,
  moduleCode,
  averageElement,
  countElement
) {
  const moduleRecords =
    records.filter(
      record =>
        record.module ===
          moduleCode &&
        Number.isFinite(
          record.score
        )
    );

  const average =
    moduleRecords.length
      ? moduleRecords.reduce(
          (
            total,
            record
          ) =>
            total +
            record.score,
          0
        ) /
        moduleRecords.length
      : 0;

  averageElement.textContent =
    `${average.toFixed(1)}%`;

  countElement.textContent =
    `${moduleRecords.length} rekod`;
}


/* =========================================================
   JADUAL PELATIH
========================================================= */

function renderStudentTable(
  records
) {
  if (!records.length) {
    studentTable.innerHTML = `
      <div class="empty-state">
        <h3>Tiada rekod ditemui</h3>

        <p>
          Cuba ubah carian atau tapisan.
        </p>
      </div>
    `;

    return;
  }

  studentTable.innerHTML = `
    <div class="responsive-table">

      <table>

        <thead>
          <tr>
            <th>Pelatih</th>
            <th>ID</th>
            <th>Modul</th>
            <th>Markah</th>
            <th>Percubaan</th>
            <th>Status</th>
            <th>Pegawai Penilai</th>
            <th>Tindakan</th>
          </tr>
        </thead>

        <tbody>
          ${records
            .map(
              renderStudentRow
            )
            .join("")}
        </tbody>

      </table>

    </div>
  `;
}


/* =========================================================
   SATU BARIS PELATIH
========================================================= */

function renderStudentRow(
  record
) {
  const student =
    record.student;

  const assessment =
    record.assessment;

  const missionId =
    Number(
      assessment?.missionId || 0
    );

  const score =
    assessment
      ? getNumericScore(
          assessment.score
        )
      : null;

  const locked =
    assessment?.locked ===
    true;

  const assessor =
    assessment?.assessor ||
    "-";

  return `
    <tr>

      <td>
        <div class="student-name-cell">

          <span class="student-avatar">
            ${escapeHtml(
              student.avatar ||
              "🧑‍💻"
            )}
          </span>

          <strong>
            ${escapeHtml(
              student.name ||
              "Pelatih"
            )}
          </strong>

        </div>
      </td>

      <td>
        ${escapeHtml(
          student.studentId ||
          "-"
        )}
      </td>

      <td>
        <span class="module-badge">
          ${escapeHtml(
            record.module
          )}
        </span>
      </td>

      <td>
        ${
          score === null
            ? "-"
            : `${score}%`
        }
      </td>

      <td>
        ${
          assessment?.attempt ||
          0
        }
      </td>

      <td>
        <span class="${getStatusClass(
          record.status
        )}">
          ${getStatusLabel(
            record.status
          )}
        </span>
      </td>

      <td>
        ${escapeHtml(
          assessor
        )}
      </td>

      <td>
        ${
          assessment
            ? renderAssessmentButtons(
                student.uid,
                missionId,
                score,
                locked
              )
            : "Belum hantar KT"
        }
      </td>

    </tr>
  `;
}


/* =========================================================
   BUTANG SAHKAN / BUKA SEMULA
========================================================= */

function renderAssessmentButtons(
  studentUid,
  missionId,
  score,
  locked
) {
  if (locked) {
    return `
      <button
        class="small-warning-button"
        type="button"
        onclick="
          window.reopenMasterAssessment(
            '${studentUid}',
            ${missionId}
          )
        "
      >
        BUKA SEMULA
      </button>
    `;
  }

  return `
    <div class="mark-action-group">

      <input
        id="mark_${studentUid}_${missionId}"
        class="mark-input"
        type="number"
        min="0"
        max="100"
        value="${score ?? 0}"
      >

      <button
        class="small-primary-button"
        type="button"
        onclick="
          window.approveMasterAssessment(
            '${studentUid}',
            ${missionId}
          )
        "
      >
        SAHKAN
      </button>

    </div>
  `;
}


/* =========================================================
   SAHKAN MARKAH RASMI
========================================================= */

window.approveMasterAssessment =
  async function (
    studentUid,
    missionId
  ) {
    const markInput =
      document.getElementById(
        `mark_${studentUid}_${missionId}`
      );

    const score =
      Number(
        markInput?.value
      );

    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100
    ) {
      showToast(
        "Markah mesti antara 0 hingga 100."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Sahkan markah rasmi ${score}% dan kunci rekod ini?`
      );

    if (!confirmed) {
      return;
    }

    const session =
      requireTeacherSession();

    try {
      await setDoc(
        doc(
          db,
          "students",
          studentUid,
          "assessments",
          `kt${missionId}`
        ),
        {
          missionId,

          ktCode:
            `KT${missionId}`,

          score,

          passed:
            score >= 60,

          status:
            score >= 60
              ? "TERAMPIL"
              : "BELUM_TERAMPIL",

          official:
            true,

          locked:
            true,

          assessor:
            session.name,

          verifiedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        },
        {
          merge: true
        }
      );

      await setDoc(
        doc(
          db,
          "students",
          studentUid
        ),
        {
          lastOfficialMission:
            `KT${missionId}`,

          lastOfficialScore:
            score,

          lastOfficialStatus:
            score >= 60
              ? "TERAMPIL"
              : "BELUM_TERAMPIL",

          updatedAt:
            serverTimestamp()
        },
        {
          merge: true
        }
      );

      showToast(
        "Markah rasmi berjaya disahkan."
      );

    } catch (error) {
      showFirebaseError(
        "Markah gagal disahkan",
        error
      );
    }
  };


/* =========================================================
   BUKA SEMULA MARKAH
========================================================= */

window.reopenMasterAssessment =
  async function (
    studentUid,
    missionId
  ) {
    const confirmed =
      window.confirm(
        "Buka semula markah rasmi ini?"
      );

    if (!confirmed) {
      return;
    }

    try {
      await updateDoc(
        doc(
          db,
          "students",
          studentUid,
          "assessments",
          `kt${missionId}`
        ),
        {
          official:
            false,

          locked:
            false,

          assessor:
            deleteField(),

          verifiedAt:
            deleteField(),

          status:
            "MENUNGGU_PENGESAHAN",

          updatedAt:
            serverTimestamp()
        }
      );

      showToast(
        "Markah berjaya dibuka semula."
      );

    } catch (error) {
      showFirebaseError(
        "Markah gagal dibuka semula",
        error
      );
    }
  };


/* =========================================================
   RANKING PELATIH
========================================================= */

function renderRanking(
  records
) {
  const studentScores =
    new Map();

  records.forEach(record => {
    if (
      !Number.isFinite(
        record.score
      )
    ) {
      return;
    }

    if (
      !studentScores.has(
        record.student.uid
      )
    ) {
      studentScores.set(
        record.student.uid,
        {
          student:
            record.student,

          scores: []
        }
      );
    }

    studentScores
      .get(
        record.student.uid
      )
      .scores.push(
        record.score
      );
  });

  const ranking =
    [...studentScores.values()]
      .map(item => {
        const average =
          item.scores.reduce(
            (
              total,
              score
            ) =>
              total + score,
            0
          ) /
          item.scores.length;

        return {
          student:
            item.student,

          average,

          moduleCount:
            item.scores.length
        };
      })
      .sort(
        (first, second) =>
          second.average -
          first.average
      )
      .slice(
        0,
        10
      );

  if (!ranking.length) {
    rankingList.innerHTML = `
      <div class="empty-state">
        <p>
          Belum ada markah untuk ranking.
        </p>
      </div>
    `;

    return;
  }

  rankingList.innerHTML =
    ranking
      .map(
        (
          item,
          index
        ) => `
          <article class="ranking-card">

            <div class="ranking-position">
              ${getMedal(index)}
            </div>

            <div class="ranking-profile">

              <span class="student-avatar">
                ${escapeHtml(
                  item.student.avatar ||
                  "🧑‍💻"
                )}
              </span>

              <div>
                <strong>
                  ${escapeHtml(
                    item.student.name ||
                    "Pelatih"
                  )}
                </strong>

                <p>
                  ID:
                  ${escapeHtml(
                    item.student.studentId ||
                    "-"
                  )}
                </p>
              </div>

            </div>

            <div class="ranking-score">

              <strong>
                ${item.average.toFixed(1)}%
              </strong>

              <span>
                ${item.moduleCount} modul
              </span>

            </div>

          </article>
        `
      )
      .join("");
}

function getMedal(
  index
) {
  if (index === 0) {
    return "🥇";
  }

  if (index === 1) {
    return "🥈";
  }

  if (index === 2) {
    return "🥉";
  }

  return `#${index + 1}`;
}


/* =========================================================
   EXPORT CSV
========================================================= */

function exportCsv() {
  const records =
    createAssessmentRecords();

  const rows = [
    [
      "Nama",
      "ID Pelatih",
      "Modul",
      "Markah",
      "Percubaan",
      "Status",
      "Pegawai Penilai"
    ]
  ];

  records.forEach(record => {
    rows.push([
      record.student.name ||
        "",

      record.student.studentId ||
        "",

      record.module,

      record.score ??
        "",

      record.assessment?.attempt ||
        0,

      getStatusLabel(
        record.status
      ),

      record.assessment?.assessor ||
        ""
    ]);
  });

  const csv =
    rows
      .map(row =>
        row
          .map(value =>
            `"${String(
              value ?? ""
            ).replaceAll(
              '"',
              '""'
            )}"`
          )
          .join(",")
      )
      .join("\n");

  downloadFile(
    "\ufeff" + csv,
    "text/csv;charset=utf-8",
    `C01-Master-Dashboard-${getCurrentDate()}.csv`
  );

  showToast(
    "Laporan CSV berjaya disediakan."
  );
}


/* =========================================================
   BACKUP JSON
========================================================= */

function exportJson() {
  const backup = [];

  students.forEach(student => {
    backup.push({
      ...student,

      assessments:
        assessmentsByStudent.get(
          student.uid
        ) || []
    });
  });

  downloadFile(
    JSON.stringify(
      {
        project:
          "COMPUTER SYSTEM SET-UP MASTER DASHBOARD",

        exportedAt:
          new Date().toISOString(),

        students:
          backup
      },
      null,
      2
    ),

    "application/json;charset=utf-8",

    `C01-Master-Backup-${getCurrentDate()}.json`
  );

  showToast(
    "Backup JSON berjaya disediakan."
  );
}


/* =========================================================
   MUAT TURUN FAIL
========================================================= */

function downloadFile(
  content,
  type,
  filename
) {
  const blob =
    new Blob(
      [content],
      { type }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href = url;

  link.download =
    filename;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );
}


/* =========================================================
   TUKAR PIN
========================================================= */

function changePin() {
  const currentPin =
    window.prompt(
      "Masukkan PIN lama:"
    );

  if (
    currentPin === null
  ) {
    return;
  }

  const savedPin =
    localStorage.getItem(
      PIN_KEY
    ) || "1515";

  if (
    currentPin !== savedPin
  ) {
    showToast(
      "PIN lama tidak tepat."
    );

    return;
  }

  const newPin =
    window.prompt(
      "Masukkan PIN baharu, minimum 4 aksara:"
    );

  if (
    newPin === null
  ) {
    return;
  }

  if (
    newPin.trim().length < 4
  ) {
    showToast(
      "PIN baharu terlalu pendek."
    );

    return;
  }

  localStorage.setItem(
    PIN_KEY,
    newPin.trim()
  );

  showToast(
    "PIN guru berjaya ditukar."
  );
}


/* =========================================================
   LOG KELUAR
========================================================= */

function logoutTeacher() {
  stopRealtime();

  sessionStorage.removeItem(
    SESSION_KEY
  );

  window.location.href =
    "login.html";
}


/* =========================================================
   UTILITI
========================================================= */

function setConnectionStatus(
  text,
  status
) {
  connectionStatus.textContent =
    text;

  connectionStatus.className =
    `connection-status ${status}`;
}

function getStatusClass(
  status
) {
  if (
    status === "TERAMPIL"
  ) {
    return "status-badge competent";
  }

  if (
    status ===
    "MENUNGGU_PENGESAHAN"
  ) {
    return "status-badge pending";
  }

  if (
    status ===
    "BELUM_TERAMPIL"
  ) {
    return "status-badge failed";
  }

  return "status-badge neutral";
}

function getStatusLabel(
  status
) {
  return String(
    status
  ).replaceAll(
    "_",
    " "
  );
}

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    );
}

function getCurrentDate() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10
    );
}

function showToast(
  message
) {
  const toast =
    document.getElementById(
      "toast"
    );

  toast.textContent =
    message;

  toast.classList.remove(
    "hidden"
  );

  window.clearTimeout(
    showToast.timer
  );

  showToast.timer =
    window.setTimeout(
      () => {
        toast.classList.add(
          "hidden"
        );
      },
      2800
    );
}


/* =========================================================
   TUTUP LISTENER APABILA KELUAR
========================================================= */

window.addEventListener(
  "beforeunload",
  stopRealtime
);
