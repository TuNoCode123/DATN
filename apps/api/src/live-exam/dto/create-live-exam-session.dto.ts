import { IsString } from 'class-validator';

/**
 * Spawn a new live exam session from an existing published template.
 * Produces a fresh joinCode + inviteSlug and snapshots the template's
 * questions. The host (current user) owns the session.
 */
export class CreateLiveExamSessionDto {
  @IsString()
  templateId!: string;
}
