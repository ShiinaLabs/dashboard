import { fetchWithConfig } from "../http";

export async function fetchContributions(username: string, token: string | undefined, year: number) {
  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `.replace(/\s+/g, " ");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "dashboard",
  };
  if (token) headers.Authorization = `bearer ${token}`;

  const res = await fetchWithConfig("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: `${year}-01-01T00:00:00Z`,
        to: `${year}-12-31T23:59:59Z`,
      },
    }),
  });

  const body: Record<string, unknown> = await res.json();
  if (body.errors) throw new Error((body.errors as Array<Record<string, unknown>>)[0].message as string);

  const weeks = ((((body.data as Record<string, unknown>)?.user as Record<string, unknown>)?.contributionsCollection as Record<string, unknown>)?.contributionCalendar as Record<string, unknown>)?.weeks;
  const days: { date: string; count: number; level: number }[] = [];

  if (!Array.isArray(weeks)) return days;
  for (const week of weeks) {
    for (const day of week.contributionDays || []) {
      days.push({
        date: day.date,
        count: day.contributionCount || 0,
        level: { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 }[day.contributionLevel as string] ?? 0,
      });
    }
  }

  return days;
}
