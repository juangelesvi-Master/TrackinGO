import type { User } from './traccar'

export const DEFAULT_BRAND = 'TracKING GO'

/** Logo y nombre de la empresa. Se guardan en attributes.teesaBrand de la empresa y de cada uno de sus usuarios. */
export interface Brand {
  name: string
  logo?: string // data URL (PNG o JPG, ya reducido)
}

export function brandOf(user: User): Brand {
  const b = user.attributes?.teesaBrand as Partial<Brand> | undefined
  return { name: b?.name?.trim() || DEFAULT_BRAND, logo: b?.logo || undefined }
}

/** Reduce una imagen a máximo 320 px de ancho para guardarla como texto en Traccar. */
export function shrinkLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 320 / img.width, 120 / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}
