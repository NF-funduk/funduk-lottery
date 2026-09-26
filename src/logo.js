export function logoHtml(suffix = '') {
  return `
    <span class="logo-wrap">
      <span class="logo-har">HARD</span><span class="logo-evo">EVO</span>
      <span class="logo-lottery">Lottery</span>
      ${suffix ? `<span class="logo-suffix">${suffix}</span>` : ''}
    </span>
  `;
}