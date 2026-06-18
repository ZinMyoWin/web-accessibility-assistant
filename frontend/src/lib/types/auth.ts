export interface LoginInput {
  email: string
  password: string
  remember: boolean
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  acceptedTerms: boolean
}
