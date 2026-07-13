// ===== ShiftBuilder state.js ここから =====

const state = {
  currentSession: null,
  currentUser: null,
  currentShiftData: null,
  selectedCell: null,
  activeAxis: "case"
};

export function getState() {
  return state;
}

export function setCurrentSession(session) {
  state.currentSession = session;
}

export function getCurrentSession() {
  return state.currentSession;
}

export function setCurrentUser(user) {
  state.currentUser = user;
}

export function getCurrentUser() {
  return state.currentUser;
}

export function setCurrentShiftData(shiftData) {
  state.currentShiftData = shiftData;
}

export function getCurrentShiftData() {
  return state.currentShiftData;
}

export function setSelectedCell(cell) {
  state.selectedCell = cell;
}

export function getSelectedCell() {
  return state.selectedCell;
}

export function resetSelectedCell() {
  state.selectedCell = null;
}

export function setActiveAxis(axis) {
  state.activeAxis = axis === "personnel" ? "personnel" : "case";
}

export function getActiveAxis() {
  return state.activeAxis;
}

// ===== ShiftBuilder state.js ここまで =====
