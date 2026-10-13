// Keep full-size photos in the gallery; request smaller images for list cards.
export function thumbnail(src: string) {
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:' || url.hostname !== 'images.unsplash.com') return src;
    url.searchParams.set('w', '640');
    url.searchParams.set('q', '75');
    url.searchParams.set('auto', 'format');
    return url.href;
  } catch { return src; }
}
