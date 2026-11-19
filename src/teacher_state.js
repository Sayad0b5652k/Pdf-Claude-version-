// Shared mutable state for the AI book chat. One object, so every teacher_* module sees the same values
// (ES module `export let` bindings can't be reassigned from another file).
export const teacherState = {
  activeFileId: null,
  currentSessionChapter: null, // { fileId, chapterNumber, chapterTitle, chapterType, startPage, endPage }
  crossPdfActive: false,
};
