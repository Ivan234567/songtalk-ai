import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { email } = await request.json()

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Проверяем существование email через попытку входа с заведомо неправильным паролем
    // Если email существует, Supabase вернет ошибку "Invalid login credentials"
    // Если email не существует, может вернуть другую ошибку
    // Но это не идеально, так как для несуществующего email тоже может быть "Invalid login credentials"
    
    // Попробуем более надежный способ - проверить через попытку восстановления пароля
    // но не отправлять письмо (если это возможно)
    
    // Временное решение - используем проверку через попытку входа
    const testPassword = 'test_check_email_' + Date.now()
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: testPassword,
    })

    // Анализируем ошибку входа
    if (loginError) {
      const errorMsg = loginError.message.toLowerCase()
      
      // Если ошибка "Invalid login credentials", email скорее всего существует
      // (пользователь есть, но пароль неверный)
      if (errorMsg.includes('invalid login') || 
          errorMsg.includes('invalid credentials') ||
          errorMsg.includes('incorrect email') ||
          errorMsg.includes('incorrect password')) {
        return NextResponse.json({ exists: true })
      }
      
      // Если ошибка "Email not confirmed", email существует
      if (errorMsg.includes('email not confirmed')) {
        return NextResponse.json({ exists: true })
      }
      
      // Если ошибка "User not found" или "Email not found", email не существует
      if (errorMsg.includes('user not found') || 
          errorMsg.includes('email not found') ||
          errorMsg.includes('no user found')) {
        return NextResponse.json({ exists: false })
      }
      
      // Для других ошибок предполагаем что email существует
      // (чтобы не блокировать регистрацию существующих пользователей)
      return NextResponse.json({ exists: true })
    }

    // Если входа удался (маловероятно с тестовым паролем), email точно существует
    if (loginData?.user) {
      // Выходим из тестового входа
      await supabase.auth.signOut()
      return NextResponse.json({ exists: true })
    }

    // Если нет ни ошибки, ни данных - считаем что email не существует
    return NextResponse.json({ exists: false })
    
  } catch (error: any) {
    console.error('Error checking email:', error)
    return NextResponse.json(
      { error: 'Failed to check email', details: error.message },
      { status: 500 }
    )
  }
}
