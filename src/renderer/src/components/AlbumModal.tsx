import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Checkbox, Modal, Skeleton } from '@heroui/react'
import type { AlbumResult, AlbumTrack, DownloadRequest } from '@shared/types'
import { albumTracksQueryOptions } from '../queries/album'
import { formatDuration } from '../utils/format'
import { useDownloadStore } from '../stores/downloadStore'

interface AlbumModalProps {
  album: AlbumResult | null
  onClose: () => void
}

function AlbumModal({ album, onClose }: AlbumModalProps): React.JSX.Element {
  return (
    <Modal.Backdrop isOpen={album !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-lg">
          <Modal.CloseTrigger />
          {/* Keyed by album id: a fresh mount per album resets the selection for free,
              instead of clearing it manually in an effect. */}
          {album && <AlbumModalContent key={album.id} album={album} onClose={onClose} />}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

interface AlbumModalContentProps {
  album: AlbumResult
  onClose: () => void
}

const TRACKLIST_SKELETON_COUNT = 6

function buildDownloadRequests(album: AlbumResult, tracks: AlbumTrack[]): DownloadRequest[] {
  const year = album.firstReleaseDate?.slice(0, 4)
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: album.title,
    releaseGroupId: album.id,
    trackNumber: track.position,
    year,
    durationMs: track.length,
    genres: album.genres
  }))
}

function AlbumModalContent({ album, onClose }: AlbumModalContentProps): React.JSX.Element {
  // Tracks are selected by default, so we track the *deselected* ones instead.
  // That way "everything selected" is just the empty initial state — no need
  // to wait for the tracklist to load before knowing what to select.
  const [deselected, setDeselected] = useState<Set<string>>(new Set())

  const { data: tracks, isLoading, isError } = useQuery(albumTracksQueryOptions(album.id))

  const toggleTrack = (id: string, isSelected: boolean): void => {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (isSelected) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (isSelected: boolean): void => {
    setDeselected(isSelected || !tracks ? new Set() : new Set(tracks.map((track) => track.id)))
  }

  const selectedCount = tracks ? tracks.length - deselected.size : 0
  const allSelected = Boolean(tracks && tracks.length > 0 && deselected.size === 0)
  const someSelected = selectedCount > 0 && !allSelected

  const registerRequests = useDownloadStore((state) => state.registerRequests)

  const handleDownload = (): void => {
    if (!tracks) return
    const selectedTracks = tracks.filter((track) => !deselected.has(track.id))
    const requests = buildDownloadRequests(album, selectedTracks)
    // Kept around so a failed download can be retried later without
    // re-fetching the tracklist or rebuilding the request by hand.
    registerRequests(requests)
    void window.api.startDownloads(requests)
    onClose()
  }

  return (
    <>
      <Modal.Header>
        <Modal.Heading>{album.title}</Modal.Heading>
      </Modal.Header>

      <Modal.Body>
        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: TRACKLIST_SKELETON_COUNT }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full rounded" />
            ))}
          </div>
        )}

        {isError && <p className="text-sm text-red-500">Failed to load the tracklist.</p>}

        {tracks && tracks.length === 0 && (
          <p className="text-sm text-neutral-500">No tracklist found for this album.</p>
        )}

        {tracks && tracks.length > 0 && (
          <div className="flex flex-col gap-1">
            <Checkbox
              isSelected={allSelected}
              isIndeterminate={someSelected}
              onChange={toggleAll}
              className="border-b border-neutral-200 pb-2 dark:border-neutral-800"
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                Select all
              </Checkbox.Content>
            </Checkbox>

            {tracks.map((track) => (
              <div
                key={track.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1"
              >
                <Checkbox
                  isSelected={!deselected.has(track.id)}
                  onChange={(isSelected) => toggleTrack(track.id, isSelected)}
                  className="min-w-0 overflow-hidden"
                >
                  <Checkbox.Content className="min-w-0">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <span className="truncate text-sm" title={track.title}>
                      {track.position}. {track.title}
                    </span>
                  </Checkbox.Content>
                </Checkbox>
                <span className="whitespace-nowrap text-xs text-neutral-500">
                  {[track.artist, formatDuration(track.length)].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="primary" isDisabled={selectedCount === 0} onPress={handleDownload}>
          {allSelected ? 'Download album' : `Download selected (${selectedCount})`}
        </Button>
      </Modal.Footer>
    </>
  )
}

export default AlbumModal
