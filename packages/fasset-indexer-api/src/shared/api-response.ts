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
  return function (_key: string, value: any) {
    if (typeof value === 'bigint') return value.toString()
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined
      seen.add(value)
    }
    return value
  }
}

function removeObjectCycles(obj: any) {
  return JSON.parse(JSON.stringify(obj, getJsonReplacer()))
}

export async function apiResponse<T>(action: Promise<T>, status: number, sanitize = true): Promise<ApiResponse<T>> {
  try {
    return new ApiResponse<T>(removeObjectCycles(await action), status)
  } catch (reason) {
    if (sanitize) {
      const message = reason instanceof Error && reason.message ? reason.message : "Server error"
      return new ApiResponse<T>(undefined, 500, message)
    }
    return new ApiResponse<T>(undefined, 500, String(reason))
  }
}
