import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anonKey)

// Calls the get-revenue edge function for a date range.
// Admins can pass a clientId to view any client's numbers.
export async function fetchRevenue(start, end, clientId) {
  const { data: { session } } = await supabase.auth.getSession()
  const qs = clientId ? `?client_id=${clientId}` : ''
  const res = await fetch(`${url}/functions/v1/get-revenue${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ start, end }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Revenue fetch failed (${res.status})`)
  }
  return res.json()
}
