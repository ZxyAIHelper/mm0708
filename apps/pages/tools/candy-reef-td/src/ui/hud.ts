export type HudValues = {
  lives: number;
  coins: number;
  enemies: number;
  projectiles: number;
};

export function createHud(root: HTMLElement): (values: HudValues) => void {
  root.innerHTML = `
    <div class="hud-top">
      <button class="hud-icon" type="button" aria-label="Pause">II</button>
      <div class="hud-pill"><span>Coins</span><strong data-hud="coins">0</strong></div>
      <div class="hud-pill"><span>Lives</span><strong data-hud="lives">0</strong></div>
      <div class="hud-pill"><span>Wave</span><strong data-hud="enemies">0</strong></div>
      <button class="hud-icon" type="button" aria-label="Home">H</button>
    </div>
  `;

  const coins = root.querySelector<HTMLElement>('[data-hud="coins"]');
  const lives = root.querySelector<HTMLElement>('[data-hud="lives"]');
  const enemies = root.querySelector<HTMLElement>('[data-hud="enemies"]');

  return (values) => {
    if (coins) coins.textContent = String(values.coins);
    if (lives) lives.textContent = String(values.lives);
    if (enemies) enemies.textContent = String(values.enemies + values.projectiles);
  };
}
