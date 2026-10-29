package com.pandu78.PDF24x7.auth

import androidx.compose.runtime.Immutable

@Immutable
data class AuthUser(
  val id: String,
  val email: String,
  val displayName: String = "",
  val consentVersion: Int = 2,
  val consentTimestamp: Long = System.currentTimeMillis(),
  val createdAt: Long = System.currentTimeMillis(),
)

sealed class AuthState {
  object Unauthenticated : AuthState()
  data class Authenticated(val user: AuthUser) : AuthState()
  data class Loading(val message: String = "") : AuthState()
  data class Error(val message: String) : AuthState()
}

sealed class AuthResult<out T> {
  data class Success<T>(val data: T) : AuthResult<T>()
  data class Error(val message: String, val exception: Throwable? = null) : AuthResult<Nothing>()
}

