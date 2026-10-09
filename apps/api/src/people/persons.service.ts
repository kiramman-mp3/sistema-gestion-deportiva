import { ConflictException, Injectable } from '@nestjs/common';
import { normalizeIdNumber } from '../common/keys.js';
import type { Prisma } from '../generated/prisma/client.js';
import { type PersonInput, PRIVATE_FIELDS } from './people.schemas.js';

export const ID_KEY_CONSTRAINT = 'person_private_data_id_key_key';
export const DUPLICATE_ID_MESSAGE =
  'Ya existe una persona registrada con ese documento';

export const idKeyOf = (idType: string, idNumber: string) =>
  `${idType}:${normalizeIdNumber(idNumber)}`;

/**
 * Creación y actualización de la identidad de una persona. Los datos privados
 * (documento, teléfono, tutor) se guardan aparte y el documento queda con una clave
 * única normalizada que impide registrar dos veces a la misma persona.
 */
@Injectable()
export class PersonsService {
  async create(
    tx: Prisma.TransactionClient,
    input: PersonInput,
  ): Promise<{ id: string }> {
    const person = await tx.person.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate
          ? new Date(`${input.birthDate}T00:00:00.000Z`)
          : null,
      },
      select: { id: true },
    });
    if (
      PRIVATE_FIELDS.some(
        (field) => input[field] !== undefined && input[field] !== null,
      )
    ) {
      await tx.personPrivateData.create({
        data: { personId: person.id, ...this.privateColumns(input) },
      });
    }
    return person;
  }

  /** Persona ya registrada con ese documento (para reutilizarla en lugar de duplicarla). */
  findByDocument(
    tx: Prisma.TransactionClient,
    idType: string,
    idNumber: string,
  ) {
    return tx.personPrivateData.findUnique({
      where: { idKey: idKeyOf(idType, idNumber) },
      select: { personId: true },
    });
  }

  /** Aplica solo los campos presentes en `changes` (`undefined` = sin cambio). */
  async updatePrivate(
    tx: Prisma.TransactionClient,
    personId: string,
    changes: Partial<PersonInput>,
  ): Promise<void> {
    const present = PRIVATE_FIELDS.filter((f) => changes[f] !== undefined);
    if (present.length === 0) return;

    const current = await tx.personPrivateData.findUnique({
      where: { personId },
    });
    const merged = {
      idType: changes.idType ?? current?.idType ?? undefined,
      idNumber: changes.idNumber ?? current?.idNumber ?? undefined,
      phone: changes.phone === undefined ? current?.phone : changes.phone,
      guardianName:
        changes.guardianName === undefined
          ? current?.guardianName
          : changes.guardianName,
      guardianRelation:
        changes.guardianRelation === undefined
          ? current?.guardianRelation
          : changes.guardianRelation,
      guardianPhone:
        changes.guardianPhone === undefined
          ? current?.guardianPhone
          : changes.guardianPhone,
    };
    const columns = this.privateColumns(merged as PersonInput);
    await tx.personPrivateData.upsert({
      where: { personId },
      create: { personId, ...columns },
      update: columns,
    });
  }

  assertDocumentFree(
    existing: { personId: string } | null,
    personId?: string,
  ): void {
    if (existing && existing.personId !== personId)
      throw new ConflictException(DUPLICATE_ID_MESSAGE);
  }

  private privateColumns(input: PersonInput) {
    return {
      idType: input.idNumber ? input.idType : null,
      idNumber: input.idNumber ?? null,
      idKey:
        input.idNumber && input.idType
          ? idKeyOf(input.idType, input.idNumber)
          : null,
      phone: input.phone ?? null,
      guardianName: input.guardianName ?? null,
      guardianRelation: input.guardianRelation ?? null,
      guardianPhone: input.guardianPhone ?? null,
    };
  }
}
