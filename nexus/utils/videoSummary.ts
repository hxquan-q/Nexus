/**
 * YouTube video transcript extraction.
 * Extracts video metadata and captions/transcript from YouTube video pages.
 */

export interface VideoInfo {
  title: string;
  channel: string;
  duration?: string;
  url: string;
  transcript?: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

/**
 * Check if a URL is a YouTube video page.
 */
export function isYouTubeVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(hostname) && !hostname.endsWith('.youtube.com')) return false;
    if (parsed.pathname === '/watch') return !!parsed.searchParams.get('v');
    if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/live/') || parsed.pathname.startsWith('/embed/')) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract YouTube video ID from a URL.
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // youtu.be short links
    if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }

    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v');
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }

    // /shorts/ID, /live/ID, /embed/ID
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (const prefix of ['shorts', 'live', 'embed']) {
      const idx = segments.indexOf(prefix);
      if (idx >= 0) {
        const id = segments[idx + 1];
        return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract video info and transcript from a YouTube tab.
 */
export async function extractYouTubeInfo(tabId: number): Promise<VideoInfo> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || '';

  // Extract metadata and transcript via content script injection
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractYouTubeDataInPage,
  });

  const data = results?.[0]?.result as {
    title?: string;
    channel?: string;
    duration?: string;
    transcript?: string;
  } | undefined;

  return {
    title: data?.title || tab.title || 'YouTube Video',
    channel: data?.channel || '',
    duration: data?.duration,
    url,
    transcript: data?.transcript,
  };
}

/**
 * Extract YouTube transcript only from a tab.
 */
export async function extractYouTubeTranscript(tabId: number): Promise<string> {
  const info = await extractYouTubeInfo(tabId);
  return info.transcript || '[No transcript available. The video may not have captions.]';
}

/**
 * Format video info for AI context.
 */
export function formatVideoInfo(info: VideoInfo): string {
  const parts: string[] = [];
  parts.push(`# Video: ${info.title}`);
  if (info.channel) parts.push(`Channel: ${info.channel}`);
  if (info.duration) parts.push(`Duration: ${info.duration}`);
  parts.push(`URL: ${info.url}`);
  parts.push('');
  if (info.transcript) {
    parts.push('## Transcript');
    parts.push(info.transcript);
  } else {
    parts.push('[No transcript available for this video]');
  }
  return parts.join('\n');
}

/**
 * This function runs in the context of the YouTube page.
 * It extracts video metadata and attempts to get captions/transcript.
 */
function extractYouTubeDataInPage(): {
  title: string;
  channel: string;
  duration: string;
  transcript: string | null;
} {
  const result = {
    title: '',
    channel: '',
    duration: '',
    transcript: null as string | null,
  };

  try {
    // Extract title
    const titleEl =
      document.querySelector('h1.yt-watch-metadata-title') ||
      document.querySelector('h1.title') ||
      document.querySelector('h1');
    result.title = titleEl?.textContent?.trim() || document.title || '';

    // Extract channel name
    const channelEl =
      document.querySelector('ytd-channel-name a') ||
      document.querySelector('.yt-user-name') ||
      document.querySelector('#channel-name');
    result.channel = channelEl?.textContent?.trim() || '';

    // Extract duration
    const durationEl =
      document.querySelector('.ytp-time-duration') ||
      document.querySelector('.time-duration');
    result.duration = durationEl?.textContent?.trim() || '';

    // Try to extract transcript from the page
    // Method 1: Check if captions are available via ytInitialPlayerResponse
    try {
      const playerResponse = (window as any).ytInitialPlayerResponse;
      if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
        const tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        if (tracks.length > 0) {
          // We can't fetch external URLs from content scripts easily,
          // so try the transcript panel approach instead
          result.transcript = null;
        }
      }
    } catch {
      // Player response not available
    }

    // Method 2: Try to open and read the transcript panel
    // Check if transcript is already visible
    const transcriptPanel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-structured-description"]');
    const transcriptSegments = document.querySelectorAll(
      'ytd-transcript-segment-renderer .segment-text, .cue-group .cue'
    );

    if (transcriptSegments.length > 0) {
      const lines: string[] = [];
      transcriptSegments.forEach((seg) => {
        const text = seg.textContent?.trim();
        if (text) lines.push(text);
      });
      if (lines.length > 0) {
        result.transcript = lines.join('\n');
      }
    }

    // Method 3: Try to get transcript from ytInitialData
    if (!result.transcript) {
      try {
        const initialData = (window as any).ytInitialData;
        if (initialData) {
          // Navigate the data structure to find transcript
          const findTranscript = (obj: any): string[] => {
            const segments: string[] = [];
            if (!obj || typeof obj !== 'object') return segments;

            // Look for transcript segments
            if (Array.isArray(obj?.transcriptBodyRenderer?.cueGroups)) {
              for (const group of obj.transcriptBodyRenderer.cueGroups) {
                const cues = group?.transcriptCueGroupRenderer?.cues;
                if (Array.isArray(cues)) {
                  for (const cue of cues) {
                    const text = cue?.transcriptCueRenderer?.cue?.simpleText;
                    if (text) segments.push(text);
                  }
                }
              }
            }

            // Recurse through object properties
            for (const key of Object.keys(obj)) {
              const found = findTranscript(obj[key]);
              if (found.length > 0) segments.push(...found);
            }

            return segments;
          };

          const transcriptSegments = findTranscript(initialData);
          if (transcriptSegments.length > 0) {
            result.transcript = transcriptSegments.join('\n');
          }
        }
      } catch {
        // Initial data parsing failed
      }
    }
  } catch (error) {
    // Return what we have
  }

  return result;
}
