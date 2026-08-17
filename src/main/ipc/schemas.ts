import { z } from 'zod'

// MusicBrainz identifiers (artist, release-group, recording, ...) are always UUIDs.
export const mbidSchema = z.uuid()

export const searchQuerySchema = z.object({
  term: z.string().trim().min(1).max(200),
  type: z.enum(['artist', 'album', 'track'])
})

const downloadRequestSchema = z.object({
  id: mbidSchema,
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300),
  albumArtist: z.string().trim().min(1).max(300),
  album: z.string().trim().min(1).max(300),
  releaseGroupId: mbidSchema,
  trackNumber: z.number().int().positive(),
  year: z.string().max(20).optional(),
  durationMs: z.number().positive().optional(),
  genres: z.array(z.string().max(100)).max(10).optional()
})

export const downloadStartSchema = z.array(downloadRequestSchema).min(1).max(200)
