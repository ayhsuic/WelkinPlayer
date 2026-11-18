/*
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

package com.atemukesu.welkin.alt

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  // Registered as fields (the recommended pattern) so the result registry is
  // ready before the activity starts.
  private val folderLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
      FolderPickerBridge.onFolderResult(uri, result.resultCode != Activity.RESULT_OK)
    }

  private val permissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) {
      FolderPickerBridge.onPermissionResult()
    }

  // Media notifications need POST_NOTIFICATIONS on Android 13+; without it the
  // service notification cannot be shown.
  private val notificationLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    FolderPickerBridge.attach(this)
    FolderPickerBridge.registerFolderLauncher(folderLauncher)
    FolderPickerBridge.registerPermissionLauncher(permissionLauncher)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
  }

  override fun onDestroy() {
    FolderPickerBridge.detach(this)
    super.onDestroy()
  }
}
