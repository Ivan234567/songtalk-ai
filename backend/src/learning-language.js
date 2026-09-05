/**
 * Resolve learning language from request (header or JSON body).
 * Default: 'en' — English flow unchanged.
 */
export function resolveLanguage(req) {
  const header = req.headers['x-learning-language']
  const bodyLang = req.body?.learningLanguage
  const raw = (typeof header === 'string' && header.trim()) || (typeof bodyLang === 'string' && bodyLang.trim()) || 'en'
  return raw === 'zh' ? 'zh' : 'en'
}

export function attachLearningLanguage(req, _res, next) {
  if (req.path.startsWith('/api/agent')) {
    req.learningLanguage = resolveLanguage(req)
  }
  next()
}
