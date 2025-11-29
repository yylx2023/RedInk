import axios from 'axios'

const API_BASE_URL = '/api'

// ==================== 认证相关 API ====================

// 获取存储的 token
export function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

// 保存 token
export function setToken(token: string): void {
  localStorage.setItem('auth_token', token)
}

// 清除 token
export function clearToken(): void {
  localStorage.removeItem('auth_token')
}

// 检查是否已登录
export function isAuthenticated(): boolean {
  return !!getToken()
}

// 登录
export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  const response = await axios.post(`${API_BASE_URL}/login`, {
    username,
    password
  })
  if (response.data.success && response.data.token) {
    setToken(response.data.token)
  }
  return response.data
}

// 登出
export async function logout(): Promise<{ success: boolean }> {
  try {
    const token = getToken()
    await axios.post(`${API_BASE_URL}/logout`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
  } catch (e) {
    // 忽略登出错误
  }
  clearToken()
  return { success: true }
}

// 验证 token
export async function verifyToken(): Promise<boolean> {
  const token = getToken()
  if (!token) return false

  try {
    const response = await axios.get(`${API_BASE_URL}/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.data.valid === true
  } catch (e) {
    return false
  }
}

// ==================== 业务接口 ====================

export interface Page {
  index: number
  type: 'cover' | 'content' | 'summary'
  content: string
}

export interface OutlineResponse {
  success: boolean
  outline?: string
  pages?: Page[]
  error?: string
}

export interface ProgressEvent {
  index: number
  status: 'generating' | 'done' | 'error'
  current?: number
  total?: number
  image_url?: string
  message?: string
}

export interface FinishEvent {
  success: boolean
  task_id: string
  images: string[]
}

// 生成大纲（支持图片上传）
export async function generateOutline(
  topic: string,
  images?: File[]
): Promise<OutlineResponse & { has_images?: boolean }> {
  // 如果有图片，使用 FormData
  if (images && images.length > 0) {
    const formData = new FormData()
    formData.append('topic', topic)
    images.forEach((file) => {
      formData.append('images', file)
    })

    const response = await axios.post<OutlineResponse & { has_images?: boolean }>(
      `${API_BASE_URL}/outline`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )
    return response.data
  }

  // 无图片，使用 JSON
  const response = await axios.post<OutlineResponse>(`${API_BASE_URL}/outline`, {
    topic
  })
  return response.data
}

// 生成图片 (SSE)
export function generateImages(
  pages: Page[],
  taskId: string | null,
  onProgress: (event: ProgressEvent) => void,
  onComplete: (event: ProgressEvent) => void,
  onError: (event: ProgressEvent) => void,
  onFinish: (event: FinishEvent) => void,
  onStreamError: (error: Error) => void
) {
  const eventSource = new EventSource(`${API_BASE_URL}/generate?pages=${encodeURIComponent(JSON.stringify(pages))}&task_id=${taskId || ''}`)

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ProgressEvent
    onProgress(data)
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ProgressEvent
    onComplete(data)
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ProgressEvent
    onError(data)
  })

  eventSource.addEventListener('finish', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as FinishEvent
    onFinish(data)
    eventSource.close()
  })

  eventSource.onerror = (error) => {
    onStreamError(new Error('SSE 连接错误'))
    eventSource.close()
  }

  return eventSource
}

// 获取图片 URL（新格式：task_id/filename）
// thumbnail 参数：true=缩略图（默认），false=原图
export function getImageUrl(taskId: string, filename: string, thumbnail: boolean = true): string {
  const thumbParam = thumbnail ? '?thumbnail=true' : '?thumbnail=false'
  return `${API_BASE_URL}/images/${taskId}/${filename}${thumbParam}`
}

// 向后兼容：自动解析包含task_id的URL
export function getImageUrlAuto(urlOrPath: string): string {
  // 如果已经是完整URL，直接返回
  if (urlOrPath.startsWith('http') || urlOrPath.startsWith('/api/')) {
    return urlOrPath
  }
  // 否则假定为 task_id/filename 格式
  return `${API_BASE_URL}/images/${urlOrPath}`
}

// 重试单张图片
export async function retrySingleImage(
  taskId: string,
  page: Page,
  useReference: boolean = true
): Promise<{ success: boolean; index: number; image_url?: string; error?: string }> {
  const response = await axios.post(`${API_BASE_URL}/retry`, {
    task_id: taskId,
    page,
    use_reference: useReference
  })
  return response.data
}

// 重新生成图片（即使成功的也可以重新生成）
export async function regenerateImage(
  taskId: string,
  page: Page,
  useReference: boolean = true,
  context?: {
    fullOutline?: string
    userTopic?: string
  }
): Promise<{ success: boolean; index: number; image_url?: string; error?: string }> {
  const response = await axios.post(`${API_BASE_URL}/regenerate`, {
    task_id: taskId,
    page,
    use_reference: useReference,
    full_outline: context?.fullOutline,
    user_topic: context?.userTopic
  })
  return response.data
}

// 批量重试失败的图片（SSE）
export async function retryFailedImages(
  taskId: string,
  pages: Page[],
  onProgress: (event: ProgressEvent) => void,
  onComplete: (event: ProgressEvent) => void,
  onError: (event: ProgressEvent) => void,
  onFinish: (event: { success: boolean; total: number; completed: number; failed: number }) => void,
  onStreamError: (error: Error) => void
) {
  try {
    const response = await fetch(`${API_BASE_URL}/retry-failed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id: taskId,
        pages
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let lastEventTime = Date.now()
    const READ_TIMEOUT = 180000 // 180秒无数据则超时（单张图片最多60秒 + 120秒缓冲）

    console.log(`[SSE] 开始读取流，超时设置: ${READ_TIMEOUT / 1000}秒`)

    while (true) {
      // 检查距离上次收到数据是否超时
      const timeSinceLastEvent = Date.now() - lastEventTime
      if (timeSinceLastEvent > READ_TIMEOUT) {
        const error = new Error(`连接超时：${READ_TIMEOUT / 1000}秒内未收到任何数据`)
        console.error('[SSE] 连接超时:', error)
        throw error
      }

      // 直接读取，不使用 Promise.race（避免 Promise 泄漏）
      let result
      try {
        console.log(`[SSE] 等待数据... (距上次: ${timeSinceLastEvent / 1000}秒)`)
        result = await reader.read()
        console.log(`[SSE] 收到数据块: ${result.done ? 'EOF' : `${result.value?.length || 0} bytes`}`)
      } catch (readError: any) {
        console.error('[SSE] 读取错误:', readError)
        throw readError
      }

      const { done, value } = result

      if (done) {
        console.log('[SSE] 流正常结束')
        break
      }

      // 更新最后接收时间
      lastEventTime = Date.now()

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        const [eventLine, dataLine] = line.split('\n')
        if (!eventLine || !dataLine) {
          console.warn('[SSE] 格式错误的行:', line)
          continue
        }

        const eventType = eventLine.replace('event: ', '').trim()
        const eventData = dataLine.replace('data: ', '').trim()

        console.log(`[SSE] 收到事件: ${eventType}`, eventData.substring(0, 100))

        try {
          const data = JSON.parse(eventData)

          switch (eventType) {
            case 'retry_start':
              onProgress({ index: -1, status: 'generating', message: data.message })
              break
            case 'complete':
              console.log(`[SSE] 图片完成: index=${data.index}`)
              onComplete(data)
              break
            case 'error':
              console.error(`[SSE] 图片错误: index=${data.index}`, data.message)
              onError(data)
              break
            case 'retry_finish':
              console.log('[SSE] 重试完成:', data)
              onFinish(data)
              break
            default:
              console.warn(`[SSE] 未知事件类型: ${eventType}`)
          }
        } catch (e) {
          console.error('[SSE] 解析数据失败:', e, '原始数据:', eventData)
        }
      }
    }
  } catch (error: any) {
    console.error('[SSE] 流错误:', error)
    const errorMessage = error.message || '未知错误'
    const enhancedError = new Error(
      `重试失败: ${errorMessage}\n` +
      `可能原因：\n` +
      `1. 网络连接不稳定\n` +
      `2. 后端处理超时（单张图片生成时间过长）\n` +
      `建议：检查网络连接后重试`
    )
    onStreamError(enhancedError)
  }
}

// ==================== 历史记录相关 API ====================

export interface HistoryRecord {
  id: string
  title: string
  created_at: string
  updated_at: string
  status: string
  thumbnail: string | null
  page_count: number
  task_id: string | null
}

export interface HistoryDetail {
  id: string
  title: string
  created_at: string
  updated_at: string
  outline: {
    raw: string
    pages: Page[]
  }
  images: {
    task_id: string | null
    generated: string[]
  }
  status: string
  thumbnail: string | null
}

// 创建历史记录
export async function createHistory(
  topic: string,
  outline: { raw: string; pages: Page[] },
  taskId?: string
): Promise<{ success: boolean; record_id?: string; error?: string }> {
  const response = await axios.post(`${API_BASE_URL}/history`, {
    topic,
    outline,
    task_id: taskId
  })
  return response.data
}

// 获取历史记录列表
export async function getHistoryList(
  page: number = 1,
  pageSize: number = 20,
  status?: string
): Promise<{
  success: boolean
  records: HistoryRecord[]
  total: number
  page: number
  page_size: number
  total_pages: number
}> {
  const params: any = { page, page_size: pageSize }
  if (status) params.status = status

  const response = await axios.get(`${API_BASE_URL}/history`, { params })
  return response.data
}

// 获取历史记录详情
export async function getHistory(recordId: string): Promise<{
  success: boolean
  record?: HistoryDetail
  error?: string
}> {
  const response = await axios.get(`${API_BASE_URL}/history/${recordId}`)
  return response.data
}

// 更新历史记录
export async function updateHistory(
  recordId: string,
  data: {
    outline?: { raw: string; pages: Page[] }
    images?: { task_id: string | null; generated: string[] }
    status?: string
    thumbnail?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const response = await axios.put(`${API_BASE_URL}/history/${recordId}`, data)
  return response.data
}

// 删除历史记录
export async function deleteHistory(recordId: string): Promise<{
  success: boolean
  error?: string
}> {
  const response = await axios.delete(`${API_BASE_URL}/history/${recordId}`)
  return response.data
}

// 搜索历史记录
export async function searchHistory(keyword: string): Promise<{
  success: boolean
  records: HistoryRecord[]
}> {
  const response = await axios.get(`${API_BASE_URL}/history/search`, {
    params: { keyword }
  })
  return response.data
}

// 获取统计信息
export async function getHistoryStats(): Promise<{
  success: boolean
  total: number
  by_status: Record<string, number>
}> {
  const response = await axios.get(`${API_BASE_URL}/history/stats`)
  return response.data
}

// 使用 POST 方式生成图片（更可靠）
export async function generateImagesPost(
  pages: Page[],
  taskId: string | null,
  fullOutline: string,
  onProgress: (event: ProgressEvent) => void,
  onComplete: (event: ProgressEvent) => void,
  onError: (event: ProgressEvent) => void,
  onFinish: (event: FinishEvent) => void,
  onStreamError: (error: Error) => void,
  userImages?: File[],
  userTopic?: string
) {
  try {
    // 将用户图片转换为 base64
    let userImagesBase64: string[] = []
    if (userImages && userImages.length > 0) {
      userImagesBase64 = await Promise.all(
        userImages.map(file => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        })
      )
    }

    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pages,
        task_id: taskId,
        full_outline: fullOutline,
        user_images: userImagesBase64.length > 0 ? userImagesBase64 : undefined,
        user_topic: userTopic || ''
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let lastEventTime = Date.now()
    const READ_TIMEOUT = 180000 // 180秒无数据则超时（单张图片最多60秒 + 120秒缓冲）

    console.log(`[SSE] 开始读取流，超时设置: ${READ_TIMEOUT / 1000}秒`)

    while (true) {
      // 检查距离上次收到数据是否超时
      const timeSinceLastEvent = Date.now() - lastEventTime
      if (timeSinceLastEvent > READ_TIMEOUT) {
        const error = new Error(`连接超时：${READ_TIMEOUT / 1000}秒内未收到任何数据`)
        console.error('[SSE] 连接超时:', error)
        throw error
      }

      // 直接读取，不使用 Promise.race（避免 Promise 泄漏）
      let result
      try {
        console.log(`[SSE] 等待数据... (距上次: ${timeSinceLastEvent / 1000}秒)`)
        result = await reader.read()
        console.log(`[SSE] 收到数据块: ${result.done ? 'EOF' : `${result.value?.length || 0} bytes`}`)
      } catch (readError: any) {
        console.error('[SSE] 读取错误:', readError)
        throw readError
      }

      const { done, value } = result

      if (done) {
        console.log('[SSE] 流正常结束')
        break
      }

      // 更新最后接收时间
      lastEventTime = Date.now()

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        const [eventLine, dataLine] = line.split('\n')
        if (!eventLine || !dataLine) {
          console.warn('[SSE] 格式错误的行:', line)
          continue
        }

        const eventType = eventLine.replace('event: ', '').trim()
        const eventData = dataLine.replace('data: ', '').trim()

        console.log(`[SSE] 收到事件: ${eventType}`, eventData.substring(0, 100))

        try {
          const data = JSON.parse(eventData)

          switch (eventType) {
            case 'progress':
              console.log(`[SSE] 进度更新: index=${data.index}, status=${data.status}`)
              onProgress(data)
              break
            case 'complete':
              console.log(`[SSE] 图片完成: index=${data.index}`)
              onComplete(data)
              break
            case 'error':
              console.error(`[SSE] 图片错误: index=${data.index}`, data.message)
              onError(data)
              break
            case 'finish':
              console.log('[SSE] 全部完成:', data)
              onFinish(data)
              break
            case 'heartbeat':
              // 心跳事件：保持连接活跃，防止代理超时
              console.log(`[SSE] 💓 心跳: index=${data.index}`)
              break
            default:
              console.warn(`[SSE] 未知事件类型: ${eventType}`)
          }
        } catch (e) {
          console.error('[SSE] 解析数据失败:', e, '原始数据:', eventData)
        }
      }
    }
  } catch (error: any) {
    console.error('[SSE] 流错误:', error)
    const errorMessage = error.message || '未知错误'
    const enhancedError = new Error(
      `图片生成失败: ${errorMessage}\n` +
      `可能原因：\n` +
      `1. 网络连接不稳定\n` +
      `2. 后端处理超时（单张图片生成时间过长）\n` +
      `3. API 服务异常\n` +
      `建议：检查网络连接和后端日志后重试`
    )
    onStreamError(enhancedError)
  }
}

// 扫描单个任务并同步图片列表
export async function scanTask(taskId: string): Promise<{
  success: boolean
  record_id?: string
  task_id?: string
  images_count?: number
  images?: string[]
  status?: string
  no_record?: boolean
  error?: string
}> {
  const response = await axios.get(`${API_BASE_URL}/history/scan/${taskId}`)
  return response.data
}

// 扫描所有任务并同步图片列表
export async function scanAllTasks(): Promise<{
  success: boolean
  total_tasks?: number
  synced?: number
  failed?: number
  orphan_tasks?: string[]
  results?: any[]
  error?: string
}> {
  const response = await axios.post(`${API_BASE_URL}/history/scan-all`)
  return response.data
}

// ==================== 配置管理 API ====================

export interface Config {
  text_generation: {
    active_provider: string
    providers: Record<string, any>
  }
  image_generation: {
    active_provider: string
    providers: Record<string, any>
  }
}

// 获取配置
export async function getConfig(): Promise<{
  success: boolean
  config?: Config
  error?: string
}> {
  const response = await axios.get(`${API_BASE_URL}/config`)
  return response.data
}

// 更新配置
export async function updateConfig(config: Partial<Config>): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  const response = await axios.post(`${API_BASE_URL}/config`, config)
  return response.data
}

// 测试服务商连接
export async function testConnection(config: {
  type: string
  provider_name?: string
  api_key?: string
  base_url?: string
  model: string
}): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  const response = await axios.post(`${API_BASE_URL}/config/test`, config)
  return response.data
}
