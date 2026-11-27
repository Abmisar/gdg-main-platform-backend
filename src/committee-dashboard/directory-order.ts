export function directoryOrder(
  left: { role: string; member: { person: { fullName: string } } },
  right: { role: string; member: { person: { fullName: string } } },
) {
  return (
    left.role.localeCompare(right.role) ||
    left.member.person.fullName.localeCompare(right.member.person.fullName)
  );
}
