import { blockIconDataURL } from '../ui/blockIcons';
import { ItemId, blockOf, isBlockItem, toolOf, armorOf, type ToolType } from './items';

/**
 * Icons for inventory/hotbar slots. Block-items reuse the isometric cube icon;
 * pure items (tools, armor, materials) get small procedural 2D sprites. Cached
 * per item id + size.
 */

const cache = new Map<number, string>();

const TIER_COLOR = ['#9c7a4d', '#9c7a4d', '#9a9aa0']; // [_, wood, stone]
const LEATHER = '#8a5a3a';
const HANDLE = '#7a5a32';

export function itemIconDataURL(item: number, size = 40): string {
  const key = item * 1000 + size;
  const hit = cache.get(key);
  if (hit) return hit;

  let url: string;
  if (isBlockItem(item)) {
    url = blockIconDataURL(blockOf(item)!, size);
  } else {
    url = drawItem(item, size);
  }
  cache.set(key, url);
  return url;
}

function drawItem(item: number, size: number): string {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const s = size;

  const tool = toolOf(item);
  const armor = armorOf(item);
  if (tool) drawTool(ctx, s, tool.type, TIER_COLOR[tool.tier] ?? '#9a9aa0');
  else if (armor) drawArmor(ctx, s, armor.slot);
  else drawMaterial(ctx, s, item);

  return cv.toDataURL();
}

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Diagonal wooden handle from bottom-left toward the centre. */
function drawHandle(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.strokeStyle = HANDLE;
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(s * 0.22, s * 0.82);
  ctx.lineTo(s * 0.6, s * 0.42);
  ctx.stroke();
}

function drawTool(ctx: CanvasRenderingContext2D, s: number, type: ToolType, head: string): void {
  if (type === 'sword') {
    // Blade up-right, crossguard, grip down-left.
    ctx.strokeStyle = head;
    ctx.lineWidth = s * 0.12;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(s * 0.34, s * 0.7);
    ctx.lineTo(s * 0.74, s * 0.26);
    ctx.stroke();
    px(ctx, '#caa46a', s * 0.24, s * 0.62, s * 0.18, s * 0.08); // crossguard
    px(ctx, HANDLE, s * 0.18, s * 0.7, s * 0.12, s * 0.12); // pommel
    return;
  }
  drawHandle(ctx, s);
  if (type === 'pickaxe') {
    ctx.strokeStyle = head;
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(s * 0.34, s * 0.3);
    ctx.quadraticCurveTo(s * 0.6, s * 0.18, s * 0.82, s * 0.34);
    ctx.stroke();
  } else if (type === 'axe') {
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.moveTo(s * 0.54, s * 0.46);
    ctx.lineTo(s * 0.6, s * 0.2);
    ctx.lineTo(s * 0.82, s * 0.3);
    ctx.lineTo(s * 0.7, s * 0.5);
    ctx.closePath();
    ctx.fill();
  } else {
    // shovel: small square head
    px(ctx, head, s * 0.54, s * 0.24, s * 0.18, s * 0.2);
  }
}

function drawArmor(ctx: CanvasRenderingContext2D, s: number, slot: number): void {
  ctx.fillStyle = LEATHER;
  if (slot === 0) {
    // helmet dome
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.55, s * 0.3, Math.PI, 0);
    ctx.fill();
    px(ctx, LEATHER, s * 0.2, s * 0.52, s * 0.6, s * 0.16);
  } else if (slot === 1) {
    px(ctx, LEATHER, s * 0.28, s * 0.24, s * 0.44, s * 0.5); // torso
    px(ctx, LEATHER, s * 0.16, s * 0.26, s * 0.14, s * 0.3); // shoulders
    px(ctx, LEATHER, s * 0.7, s * 0.26, s * 0.14, s * 0.3);
  } else if (slot === 2) {
    px(ctx, LEATHER, s * 0.3, s * 0.22, s * 0.4, s * 0.2); // waist
    px(ctx, LEATHER, s * 0.32, s * 0.4, s * 0.14, s * 0.4); // legs
    px(ctx, LEATHER, s * 0.54, s * 0.4, s * 0.14, s * 0.4);
  } else {
    px(ctx, LEATHER, s * 0.28, s * 0.5, s * 0.18, s * 0.28); // boots
    px(ctx, LEATHER, s * 0.54, s * 0.5, s * 0.18, s * 0.28);
  }
}

function drawMaterial(ctx: CanvasRenderingContext2D, s: number, item: number): void {
  switch (item) {
    case ItemId.Stick:
      ctx.strokeStyle = HANDLE;
      ctx.lineWidth = s * 0.1;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(s * 0.32, s * 0.78);
      ctx.lineTo(s * 0.66, s * 0.22);
      ctx.stroke();
      break;
    case ItemId.Coal:
      px(ctx, '#2a2a2e', s * 0.28, s * 0.32, s * 0.44, s * 0.4);
      px(ctx, '#151518', s * 0.4, s * 0.42, s * 0.2, s * 0.2);
      break;
    case ItemId.Leather:
      px(ctx, '#9a6a44', s * 0.24, s * 0.28, s * 0.52, s * 0.44);
      px(ctx, '#7a4f30', s * 0.36, s * 0.4, s * 0.28, s * 0.2);
      break;
    case ItemId.Bone:
      ctx.strokeStyle = '#eee8dc';
      ctx.lineWidth = s * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.32, s * 0.68);
      ctx.lineTo(s * 0.68, s * 0.32);
      ctx.stroke();
      break;
    case ItemId.Feather:
      ctx.strokeStyle = '#e8eef2';
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.34, s * 0.72);
      ctx.lineTo(s * 0.66, s * 0.28);
      ctx.stroke();
      break;
    case ItemId.Gunpowder:
      ctx.fillStyle = '#6a6a6a';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 6.28;
        px(ctx, '#6a6a6a', s * (0.5 + 0.18 * Math.cos(a)) - 2, s * (0.5 + 0.18 * Math.sin(a)) - 2, 4, 4);
      }
      break;
    case ItemId.Porkchop:
      px(ctx, '#e09a9a', s * 0.28, s * 0.34, s * 0.42, s * 0.34);
      px(ctx, '#c97c7c', s * 0.34, s * 0.4, s * 0.22, s * 0.18);
      break;
    default:
      px(ctx, '#b060c0', s * 0.3, s * 0.3, s * 0.4, s * 0.4);
  }
}
