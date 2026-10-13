import type { Prisma } from '../generated/prisma/client.js';

/** Datos que hay que cargar de un partido para poder nombrar a sus participantes. */
export const EVENT_LABEL_INCLUDE = {
  participants: {
    include: {
      registration: {
        include: {
          participant: {
            include: {
              team: { include: { team: true } },
              individual: {
                include: { athlete: { include: { person: true } } },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EventInclude;

type EventWithParticipants = Prisma.EventGetPayload<{
  include: typeof EVENT_LABEL_INCLUDE;
}>;

/** Participantes de un partido: nombres para mostrar y clubes involucrados. */
export function describeParticipants(event: EventWithParticipants): {
  names: string[];
  label: string;
  clubIds: string[];
  teamIds: string[];
  athleteIds: string[];
} {
  const names: string[] = [];
  const clubIds = new Set<string>();
  const teamIds: string[] = [];
  const athleteIds: string[] = [];
  for (const ep of event.participants) {
    const p = ep.registration.participant;
    if (p.team) {
      names.push(p.team.team.name);
      clubIds.add(p.team.team.clubId);
      teamIds.push(p.team.team.id);
    } else if (p.individual) {
      const { person, clubId, id } = p.individual.athlete;
      names.push(`${person.firstName} ${person.lastName}`);
      clubIds.add(clubId);
      athleteIds.push(id);
    }
  }
  return {
    names,
    label: names.length > 0 ? names.join(' vs ') : 'Partido por definir',
    clubIds: [...clubIds],
    teamIds,
    athleteIds,
  };
}
