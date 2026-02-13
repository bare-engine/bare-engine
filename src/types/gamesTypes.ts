export interface Rectangle
{
    x: number,
    y: number,
    width: number,
    height: number,
}

export interface Rectangle2Vec
{
    x1: number,
    y1: number,
    x2: number,
    y2: number,
}

export enum HitboxType
{
  Circle,
  Rectangle
}

export enum CameraScaleMode
{
  Cover, // WHEN ZOOMED OUT, FITS CONTENT WITHIN SCREEN, LEAVING NO SPACE AROUND (WILL NEVER SEE OUTSIDE CONTENT BOUNDS)
  Contain // WHEN ZOOMED OUT, FITS CONTENT WITHIN SCREEN, LEAVING SPACE AROUND (LETTERBOX)
}
