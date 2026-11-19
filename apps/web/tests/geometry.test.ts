import { describe, expect, it } from 'vitest'
import { arcPath, niceSpeedMax, polar, shortestRotation, valueToAngle } from '../src/logic/geometry'

describe('geometría de los indicadores', () => {
  it('0° está arriba y el ángulo crece en sentido horario', () => {
    const top = polar(100, 100, 50, 0)
    expect(top.x).toBeCloseTo(100)
    expect(top.y).toBeCloseTo(50)
    const right = polar(100, 100, 50, 90)
    expect(right.x).toBeCloseTo(150)
    expect(right.y).toBeCloseTo(100)
  })

  it('un arco sin longitud es vacío y uno largo usa la bandera de arco grande', () => {
    expect(arcPath(100, 100, 50, 10, 10)).toBe('')
    expect(arcPath(100, 100, 50, -130, 130)).toContain(' 1 1 ')
    expect(arcPath(100, 100, 50, 0, 90)).toContain(' 0 1 ')
  })

  it('la escala lineal se recorta a los extremos', () => {
    expect(valueToAngle(5, 10, -130, 130)).toBe(0)
    expect(valueToAngle(50, 10, -130, 130)).toBe(130)
    expect(valueToAngle(-3, 10, -130, 130)).toBe(-130)
    expect(valueToAngle(5, 0, -130, 130)).toBe(-130)
  })

  it('la aguja gira por el camino corto', () => {
    expect(shortestRotation(350, 10)).toBe(370)
    expect(shortestRotation(10, 350)).toBe(-10)
    expect(shortestRotation(90, 135)).toBe(135)
    expect(shortestRotation(370, 20)).toBe(380)
  })

  it('el fondo de escala del velocímetro crece con la velocidad', () => {
    expect(niceSpeedMax(null)).toBe(10)
    expect(niceSpeedMax(8)).toBe(10)
    expect(niceSpeedMax(9.5)).toBe(15)
    expect(niceSpeedMax(14)).toBe(20)
    expect(niceSpeedMax(35)).toBe(40)
    expect(niceSpeedMax(120)).toBe(150)
  })
})
