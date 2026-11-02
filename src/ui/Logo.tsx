/** Kagaku mark: Uttam's pencil cat, the same picture as the app icon (public/icon.svg). */
export function Logo({ size = 32 }: { size?: number }) {
  return <img className="logo-mark" src={`${import.meta.env.BASE_URL}icon.svg`} width={size} height={size} alt="" aria-hidden draggable={false} />
}
