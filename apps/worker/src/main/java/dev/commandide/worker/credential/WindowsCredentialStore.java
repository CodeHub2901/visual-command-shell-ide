package dev.commandide.worker.credential;

import com.sun.jna.Memory;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.Structure;
import com.sun.jna.WString;
import com.sun.jna.platform.win32.Kernel32;
import com.sun.jna.platform.win32.WinBase;
import com.sun.jna.ptr.PointerByReference;
import com.sun.jna.win32.StdCallLibrary;
import com.sun.jna.win32.W32APIOptions;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

final class WindowsCredentialStore implements SecureCredentialStore {
    private static final int CRED_TYPE_GENERIC = 1;
    private static final int CRED_PERSIST_LOCAL_MACHINE = 2;
    private static final int ERROR_NOT_FOUND = 1168;
    private static final String TARGET_PREFIX = "dev.commandide/";
    private final CredentialApi api;

    static WindowsCredentialStore create() {
        CredentialApi api = Native.load(
                "Advapi32", CredentialApi.class, W32APIOptions.UNICODE_OPTIONS);
        return new WindowsCredentialStore(api);
    }

    WindowsCredentialStore(CredentialApi api) {
        this.api = api;
    }

    @Override
    public boolean available() {
        return true;
    }

    @Override
    public String backend() {
        return "windows-credential-manager";
    }

    @Override
    public Optional<char[]> get(String provider) {
        PointerByReference reference = new PointerByReference();
        if (!api.CredReadW(new WString(target(provider)), CRED_TYPE_GENERIC, 0, reference)) {
            int error = Kernel32.INSTANCE.GetLastError();
            if (error == ERROR_NOT_FOUND) return Optional.empty();
            throw new IllegalStateException("Windows Credential Manager read failed");
        }
        Pointer pointer = reference.getValue();
        try {
            Credential credential = new Credential(pointer);
            if (credential.credentialBlob == null || credential.credentialBlobSize <= 0) {
                return Optional.empty();
            }
            byte[] encoded = credential.credentialBlob.getByteArray(
                    0, credential.credentialBlobSize);
            try {
                java.nio.CharBuffer decoded = StandardCharsets.UTF_16LE.decode(
                        java.nio.ByteBuffer.wrap(encoded));
                char[] value = new char[decoded.remaining()];
                decoded.get(value);
                return Optional.of(value);
            } finally {
                Arrays.fill(encoded, (byte) 0);
            }
        } finally {
            api.CredFree(pointer);
        }
    }

    @Override
    public void put(String provider, char[] secret) {
        byte[] encoded = StandardCharsets.UTF_16LE.encode(
                java.nio.CharBuffer.wrap(secret)).array();
        int byteLength = secret.length * Character.BYTES;
        Memory memory = new Memory(byteLength);
        try {
            memory.write(0, encoded, 0, byteLength);
            Credential credential = new Credential();
            credential.flags = 0;
            credential.type = CRED_TYPE_GENERIC;
            credential.targetName = new WString(target(provider));
            credential.comment = new WString("Command IDE provider credential");
            credential.credentialBlobSize = byteLength;
            credential.credentialBlob = memory;
            credential.persist = CRED_PERSIST_LOCAL_MACHINE;
            credential.userName = new WString("Command IDE");
            credential.write();
            if (!api.CredWriteW(credential, 0)) {
                throw new IllegalStateException("Windows Credential Manager write failed");
            }
        } finally {
            memory.clear();
            Arrays.fill(encoded, (byte) 0);
        }
    }

    @Override
    public boolean delete(String provider) {
        if (api.CredDeleteW(new WString(target(provider)), CRED_TYPE_GENERIC, 0)) {
            return true;
        }
        int error = Kernel32.INSTANCE.GetLastError();
        if (error == ERROR_NOT_FOUND) return false;
        throw new IllegalStateException("Windows Credential Manager delete failed");
    }

    private String target(String provider) {
        return TARGET_PREFIX + provider;
    }

    interface CredentialApi extends StdCallLibrary {
        boolean CredWriteW(Credential credential, int flags);

        boolean CredReadW(WString targetName, int type, int flags, PointerByReference credential);

        boolean CredDeleteW(WString targetName, int type, int flags);

        void CredFree(Pointer credential);
    }

    @Structure.FieldOrder({
        "flags", "type", "targetName", "comment", "lastWritten",
        "credentialBlobSize", "credentialBlob", "persist", "attributeCount",
        "attributes", "targetAlias", "userName"
    })
    public static final class Credential extends Structure {
        public int flags;
        public int type;
        public WString targetName;
        public WString comment;
        public WinBase.FILETIME lastWritten;
        public int credentialBlobSize;
        public Pointer credentialBlob;
        public int persist;
        public int attributeCount;
        public Pointer attributes;
        public WString targetAlias;
        public WString userName;

        public Credential() {}

        Credential(Pointer pointer) {
            super(pointer);
            read();
        }
    }
}
