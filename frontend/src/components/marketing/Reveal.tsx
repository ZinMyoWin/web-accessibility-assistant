"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type RevealProps = {
  children: ReactNode
  className?: string
  as?: "div" | "section"
}

export function Reveal({ children, className, as: Comp = "div" }: RevealProps) {
  const ref = useRef<HTMLDivElement | HTMLElement | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.classList.add("in")
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          node.classList.add("in")
          observer.unobserve(node)
        }
      },
      { threshold: 0.12 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Comp ref={ref as never} className={cn("marketing-reveal", className)}>
      {children}
    </Comp>
  )
}
