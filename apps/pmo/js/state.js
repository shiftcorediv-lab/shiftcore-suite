export let currentDate = new Date();
currentDate.setDate(1);
currentDate.setMonth(currentDate.getMonth() + 1);

export let selectedDates = new Set();
export let noHolidayRequested = false;

export let currentUser = {
  userId: "",
  displayName: "",
  employeeCode: "",
  role: "",
  workStatus: ""
};

export function setCurrentUser(user) {
  currentUser = user;
}

export function setNoHolidayRequested(value) {
  noHolidayRequested = value;
}

export function clearSelectedDates() {
  selectedDates.clear();
}

export function addSelectedDate(dateStr) {
  selectedDates.add(dateStr);
}

export function deleteSelectedDate(dateStr) {
  selectedDates.delete(dateStr);
}

export function resetFormState() {
  selectedDates.clear();
  noHolidayRequested = false;
}
