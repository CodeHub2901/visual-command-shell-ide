// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.risk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.ShellProgram;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.util.List;
import org.junit.jupiter.api.Test;

final class RiskAssessmentServiceTest {
    private final CatalogService catalog = new CatalogService(new SystemProfile(
            "linux", "x86_64", new ShellEnvironment("/bin/bash", "bash"),
            new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true), List.of()));
    private final RiskAssessmentService service = new RiskAssessmentService(catalog, new BashGenerator(catalog));

    @Test
    void hashesTheExactLowRiskReviewedLsScript() {
        RiskAssessment first = service.assess(program("ls", List.of(
                new ShellProgram.OptionSelection("all", "-a", null),
                new ShellProgram.OptionSelection("long", "-l", null))));
        RiskAssessment second = service.assess(program("ls", List.of()));

        assertEquals("ls -al", first.script());
        assertEquals("low", first.level());
        assertEquals("none", first.confirmation());
        assertEquals(64, first.reviewHash().length());
        assertNotEquals(first.reviewHash(), second.reviewHash());
    }

    @Test
    void elevatesFilesystemWritesAndPackageChanges() {
        RiskAssessment archive = service.assess(program("tar", List.of(
                new ShellProgram.OptionSelection("create", "-c", null))));
        RiskAssessment packages = service.assess(new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.CommandNode(
                        "node-1", "apt",
                        List.of(new ShellProgram.OptionSelection("assume-yes", "-y", null)),
                        List.of(new ShellProgram.ArgumentValue("command", "install"))))));

        assertEquals("medium", archive.level());
        assertEquals("high", packages.level());
        assertEquals(2, packages.evidence().size());
    }

    @Test
    void classifiesSudoAsHighRiskPrivilegeElevation() {
        RiskAssessment sudo = service.assess(new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.CommandNode(
                        "sudo-1", "sudo", List.of(), List.of(
                                new ShellProgram.ArgumentValue("command", "whoami", "literal"))))));

        assertEquals("sudo whoami", sudo.script());
        assertEquals("high", sudo.level());
        assertEquals("confirm", sudo.confirmation());
        assertEquals("catalog.system-change", sudo.evidence().getFirst().ruleId());
    }

    @Test
    void classifiesExpandedCatalogSignalsAndSystemChanges() {
        RiskAssessment signal = service.assess(new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.CommandNode(
                        "pkill-1", "pkill", List.of(), List.of(
                                new ShellProgram.ArgumentValue("pattern", "worker", "literal"))))));
        RiskAssessment unmount = service.assess(new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.CommandNode(
                        "umount-1", "umount", List.of(), List.of(
                                new ShellProgram.ArgumentValue("targets", "/mnt/archive", "literal"))))));
        RiskAssessment build = service.assess(new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.CommandNode(
                        "make-1", "make", List.of(), List.of(
                                new ShellProgram.ArgumentValue("targets-or-variables", "release", "literal"))))));

        assertEquals("medium", signal.level());
        assertEquals("catalog.side-effect", signal.evidence().getFirst().ruleId());
        assertEquals("critical", unmount.level());
        assertEquals("operation.mount", unmount.evidence().getFirst().ruleId());
        assertEquals("high", build.level());
    }

    @Test
    void distinguishesDeletionFromRecursiveDestructiveOperations() {
        RiskAssessment removeFile = service.assess(command(
                "rm",
                List.of(),
                List.of(new ShellProgram.ArgumentValue("files", "old.log", "literal"))));
        RiskAssessment removeTree = service.assess(command(
                "rm",
                List.of(new ShellProgram.OptionSelection("recursive", "-r", null)),
                List.of(new ShellProgram.ArgumentValue("files", "old-directory", "literal"))));
        RiskAssessment changeMode = service.assess(command(
                "chmod",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("mode", "640", "literal"),
                        new ShellProgram.ArgumentValue("files", "config.ini", "literal"))));
        RiskAssessment changeTreeMode = service.assess(command(
                "chmod",
                List.of(new ShellProgram.OptionSelection("recursive", "-R", null)),
                List.of(
                        new ShellProgram.ArgumentValue("mode", "u+rwX", "literal"),
                        new ShellProgram.ArgumentValue("files", "project", "literal"))));

        assertEquals("high", removeFile.level());
        assertEquals("catalog.destructive", removeFile.evidence().getFirst().ruleId());
        assertEquals("critical", removeTree.level());
        assertEquals("operation.recursive-destructive", removeTree.evidence().getFirst().ruleId());
        assertEquals("high", changeMode.level());
        assertEquals("critical", changeTreeMode.level());
    }

    @Test
    void distinguishesMountInspectionFromMountChanges() {
        RiskAssessment listMounts = service.assess(command("mount", List.of(), List.of()));
        RiskAssessment attach = service.assess(command(
                "mount",
                List.of(new ShellProgram.OptionSelection("read-only", "-r", null)),
                List.of(
                        new ShellProgram.ArgumentValue("source", "/dev/sdb1", "literal"),
                        new ShellProgram.ArgumentValue("directory", "/mnt/data", "literal"))));

        assertEquals("low", listMounts.level());
        assertEquals("operation.read-only", listMounts.evidence().getFirst().ruleId());
        assertEquals("critical", attach.level());
        assertEquals("type-script", attach.confirmation());
        assertEquals("operation.mount", attach.evidence().getFirst().ruleId());
    }

    @Test
    void scoresSystemControlClientsBySelectedOperation() {
        RiskAssessment serviceStatus = service.assess(command(
                "systemctl",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "status", "literal"),
                        new ShellProgram.ArgumentValue("units", "ssh.service", "literal"))));
        RiskAssessment serviceRestart = service.assess(command(
                "systemctl",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "restart", "literal"),
                        new ShellProgram.ArgumentValue("units", "ssh.service", "literal"))));
        RiskAssessment serviceEnable = service.assess(command(
                "systemctl",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "enable", "literal"),
                        new ShellProgram.ArgumentValue("units", "ssh.service", "literal"))));
        RiskAssessment timeStatus = service.assess(command(
                "timedatectl",
                List.of(),
                List.of(new ShellProgram.ArgumentValue("command", "status", "literal"))));
        RiskAssessment setTimezone = service.assess(command(
                "timedatectl",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "set-timezone", "literal"),
                        new ShellProgram.ArgumentValue("value", "Asia/Kolkata", "literal"))));
        RiskAssessment hostNameRead = service.assess(command(
                "hostnamectl",
                List.of(),
                List.of(new ShellProgram.ArgumentValue("command", "hostname", "literal"))));
        RiskAssessment hostNameWrite = service.assess(command(
                "hostnamectl",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "hostname", "literal"),
                        new ShellProgram.ArgumentValue("name", "build-node-01", "literal"))));

        assertEquals("low", serviceStatus.level());
        assertEquals("high", serviceRestart.level());
        assertEquals("critical", serviceEnable.level());
        assertEquals("low", timeStatus.level());
        assertEquals("critical", setTimezone.level());
        assertEquals("low", hostNameRead.level());
        assertEquals("critical", hostNameWrite.level());
    }

    @Test
    void marksDownloadedContentPipedToAShellAsHighRisk() {
        ShellProgram.CommandNode download = new ShellProgram.CommandNode(
                "download",
                "curl",
                List.of(new ShellProgram.OptionSelection("fail", "-f", null)),
                List.of(new ShellProgram.ArgumentValue("urls", "https://example.com/install.sh", "literal")));
        ShellProgram.CommandNode shell = new ShellProgram.CommandNode(
                "shell",
                "sudo",
                List.of(),
                List.of(new ShellProgram.ArgumentValue("command", "bash", "literal")));
        RiskAssessment assessment = service.assess(new ShellProgram(
                "1.4.0",
                "bash",
                List.of(new ShellProgram.PipelineNode("pipeline", "|", List.of(download, shell)))));

        assertEquals("curl -f https://example.com/install.sh | sudo bash", assessment.script());
        assertEquals("high", assessment.level());
        assertTrue(assessment.evidence().stream()
                .anyMatch(item -> item.ruleId().equals("shell.download-pipe")));
    }

    @Test
    void distinguishesPackageQueriesAndSimulationsFromPackageChanges() {
        RiskAssessment aptSearch = service.assess(command(
                "apt",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "search", "literal"),
                        new ShellProgram.ArgumentValue("packages", "ripgrep", "literal"))));
        RiskAssessment aptSimulation = service.assess(command(
                "apt",
                List.of(new ShellProgram.OptionSelection("simulate", "-s", null)),
                List.of(
                        new ShellProgram.ArgumentValue("command", "install", "literal"),
                        new ShellProgram.ArgumentValue("packages", "ripgrep", "literal"))));
        RiskAssessment aptInstall = service.assess(command(
                "apt",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "install", "literal"),
                        new ShellProgram.ArgumentValue("packages", "ripgrep", "literal"))));

        CatalogService fedoraCatalog = new CatalogService(new SystemProfile(
                "linux", "x86_64", new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("fedora", "44", "Fedora Linux 44", "fedora", true), List.of()));
        RiskAssessmentService fedoraRisks =
                new RiskAssessmentService(fedoraCatalog, new BashGenerator(fedoraCatalog));
        RiskAssessment dnfInfo = fedoraRisks.assess(command(
                "dnf",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "info", "literal"),
                        new ShellProgram.ArgumentValue("arguments", "ripgrep", "literal"))));
        RiskAssessment dnfNo = fedoraRisks.assess(command(
                "dnf",
                List.of(new ShellProgram.OptionSelection("assume-no", "--assumeno", null)),
                List.of(
                        new ShellProgram.ArgumentValue("command", "install", "literal"),
                        new ShellProgram.ArgumentValue("arguments", "ripgrep", "literal"))));
        RiskAssessment dnfInstall = fedoraRisks.assess(command(
                "dnf",
                List.of(),
                List.of(
                        new ShellProgram.ArgumentValue("command", "install", "literal"),
                        new ShellProgram.ArgumentValue("arguments", "ripgrep", "literal"))));

        assertEquals("medium", aptSearch.level());
        assertEquals("operation.package-query", aptSearch.evidence().getFirst().ruleId());
        assertEquals("medium", aptSimulation.level());
        assertEquals("high", aptInstall.level());
        assertEquals("operation.package-change", aptInstall.evidence().getFirst().ruleId());
        assertEquals("medium", dnfInfo.level());
        assertEquals("medium", dnfNo.level());
        assertEquals("high", dnfInstall.level());
    }

    @Test
    void treatsOutputRedirectsAsSideEffectsAndRawCodeAsCritical() {
        ShellProgram.CommandNode list = new ShellProgram.CommandNode(
                "list", "ls", List.of(), List.of());
        RiskAssessment redirect = service.assess(new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.RedirectNode(
                        "redirect", list, List.of(new ShellProgram.Redirection(">", "out.txt"))))));
        RiskAssessment raw = service.assess(new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.RawCodeNode(
                        "raw", "eval \"$CUSTOM\"", "Dynamic evaluation"))));

        assertEquals("medium", redirect.level());
        assertEquals("critical", raw.level());
        assertEquals("type-script", raw.confirmation());
    }

    private ShellProgram program(String commandId, List<ShellProgram.OptionSelection> options) {
        return command(commandId, options, List.of());
    }

    private ShellProgram command(
            String commandId,
            List<ShellProgram.OptionSelection> options,
            List<ShellProgram.ArgumentValue> arguments) {
        return new ShellProgram(
                "1.4.0", "bash", List.of(new ShellProgram.CommandNode(
                        "node-1", commandId, options, arguments)));
    }
}
