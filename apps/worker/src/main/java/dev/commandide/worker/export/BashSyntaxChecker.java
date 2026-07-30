package dev.commandide.worker.export;

@FunctionalInterface
public interface BashSyntaxChecker {
    void requireValid(String script) throws Exception;
}
