import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"


export class ApiError {
  @ApiPropertyOptional()
  className?: string

  @ApiPropertyOptional()
  fieldErrors?: { [key: string]: string }
}

export class ApiResponse<T> {
  data?: T

  @ApiPropertyOptional()
  error?: string

  @ApiProperty()
  status: number

  @ApiPropertyOptional()
  validationErrorDetails?: ApiError

  constructor(data: T, status: number, error?: string) {
    this.status = status
    this.data = data
    this.error = error
  }
}

function getJsonReplacer() {
  const seen = new WeakSet<object>()
  return (_key: string, value: unknown): unknown => {
    if (typeof value === 'bigint') return value.toString()
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined
      seen.add(value)
    }
    return value
  }
}

function removeObjectCycles<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, getJsonReplacer()))
}

export async function apiResponse<T>(action: Promise<T>, status: number, sanitize = true): Promise<ApiResponse<T>> {
  try {
    return new ApiResponse<T>(removeObjectCycles(await action), status)
  } catch (reason) {
    const errorStatus = status >= 400 && status < 600 ? status : 500
    if (sanitize) {
      const message = reason instanceof Error
        ? (reason.message || "Server error")
        : (typeof reason === 'string' && reason ? reason : "Server error")
      return new ApiResponse<T>(undefined, errorStatus, message)
    }
    return new ApiResponse<T>(undefined, errorStatus, String(reason))
  }
}
