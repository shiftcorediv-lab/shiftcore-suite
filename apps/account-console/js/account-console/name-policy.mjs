function text(value) {
  return String(value ?? "").trim();
}

export function resolveAccountFullName(user) {
  const familyName = text(user?.family_name);
  const givenName = text(user?.given_name);

  if (familyName && givenName) {
    return `${familyName}${givenName}`;
  }

  return text(user?.name);
}
