// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.credential;

import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.ptr.IntByReference;
import com.sun.jna.ptr.PointerByReference;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

final class MacOsKeychainCredentialStore implements SecureCredentialStore {
    private static final int SUCCESS = 0;
    private static final int ITEM_NOT_FOUND = -25300;
    private static final byte[] SERVICE = "dev.commandide".getBytes(StandardCharsets.UTF_8);
    private final SecurityApi security;
    private final CoreFoundationApi coreFoundation;

    static MacOsKeychainCredentialStore create() {
        return new MacOsKeychainCredentialStore(
                Native.load("Security", SecurityApi.class),
                Native.load("CoreFoundation", CoreFoundationApi.class));
    }

    MacOsKeychainCredentialStore(SecurityApi security, CoreFoundationApi coreFoundation) {
        this.security = security;
        this.coreFoundation = coreFoundation;
    }

    @Override
    public boolean available() {
        return true;
    }

    @Override
    public String backend() {
        return "macos-keychain";
    }

    @Override
    public Optional<char[]> get(String provider) {
        byte[] account = account(provider);
        IntByReference length = new IntByReference();
        PointerByReference data = new PointerByReference();
        PointerByReference item = new PointerByReference();
        int result = security.SecKeychainFindGenericPassword(
                null, SERVICE.length, SERVICE, account.length, account,
                length, data, item);
        if (result == ITEM_NOT_FOUND) return Optional.empty();
        requireSuccess(result, "read");
        byte[] encoded = data.getValue().getByteArray(0, length.getValue());
        try {
            CharBuffer decoded = StandardCharsets.UTF_8.decode(ByteBuffer.wrap(encoded));
            char[] value = new char[decoded.remaining()];
            decoded.get(value);
            return Optional.of(value);
        } finally {
            Arrays.fill(encoded, (byte) 0);
            security.SecKeychainItemFreeContent(null, data.getValue());
            release(item.getValue());
        }
    }

    @Override
    public void put(String provider, char[] credential) {
        byte[] account = account(provider);
        ByteBuffer encodedBuffer = StandardCharsets.UTF_8.encode(CharBuffer.wrap(credential));
        byte[] encoded = new byte[encodedBuffer.remaining()];
        encodedBuffer.get(encoded);
        PointerByReference item = new PointerByReference();
        try {
            int find = security.SecKeychainFindGenericPassword(
                    null, SERVICE.length, SERVICE, account.length, account,
                    null, null, item);
            if (find == SUCCESS) {
                try {
                    requireSuccess(security.SecKeychainItemModifyAttributesAndData(
                            item.getValue(), null, encoded.length, encoded), "write");
                } finally {
                    release(item.getValue());
                }
                return;
            }
            if (find != ITEM_NOT_FOUND) requireSuccess(find, "find");
            requireSuccess(security.SecKeychainAddGenericPassword(
                    null, SERVICE.length, SERVICE, account.length, account,
                    encoded.length, encoded, null), "write");
        } finally {
            Arrays.fill(encoded, (byte) 0);
        }
    }

    @Override
    public boolean delete(String provider) {
        byte[] account = account(provider);
        PointerByReference item = new PointerByReference();
        int find = security.SecKeychainFindGenericPassword(
                null, SERVICE.length, SERVICE, account.length, account,
                null, null, item);
        if (find == ITEM_NOT_FOUND) return false;
        requireSuccess(find, "find");
        try {
            requireSuccess(security.SecKeychainItemDelete(item.getValue()), "delete");
            return true;
        } finally {
            release(item.getValue());
        }
    }

    private byte[] account(String provider) {
        return provider.getBytes(StandardCharsets.UTF_8);
    }

    private void requireSuccess(int result, String operation) {
        if (result != SUCCESS) {
            throw new IllegalStateException("macOS Keychain " + operation + " failed");
        }
    }

    private void release(Pointer pointer) {
        if (pointer != null) coreFoundation.CFRelease(pointer);
    }

    interface SecurityApi extends Library {
        int SecKeychainFindGenericPassword(
                Pointer keychain,
                int serviceNameLength,
                byte[] serviceName,
                int accountNameLength,
                byte[] accountName,
                IntByReference passwordLength,
                PointerByReference passwordData,
                PointerByReference itemRef);

        int SecKeychainAddGenericPassword(
                Pointer keychain,
                int serviceNameLength,
                byte[] serviceName,
                int accountNameLength,
                byte[] accountName,
                int passwordLength,
                byte[] passwordData,
                PointerByReference itemRef);

        int SecKeychainItemModifyAttributesAndData(
                Pointer itemRef,
                Pointer attributes,
                int length,
                byte[] data);

        int SecKeychainItemDelete(Pointer itemRef);

        int SecKeychainItemFreeContent(Pointer attributes, Pointer data);
    }

    interface CoreFoundationApi extends Library {
        void CFRelease(Pointer value);
    }
}

