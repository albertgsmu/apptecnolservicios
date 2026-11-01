import logoJp from '../assets-brand/logojp.jpg'

type BrandMarkProps = {
  size?: number
}

export function BrandMark({ size = 58 }: BrandMarkProps) {
  return (
    <img
      src={logoJp}
      alt="JP Mantenimiento Integral"
      className="brand-mark-svg"
      style={{ width: size, height: 'auto' }}
    />
  )
}
