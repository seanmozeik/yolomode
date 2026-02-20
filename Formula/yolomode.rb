class Yolomode < Formula
  desc "Claude Code skill manager and agent runner"
  homepage "https://github.com/seanmozeik/yolomode"
  version "0.1.0"
  license "MIT"

  # URL to bundled source (single JS file)
  url "https://github.com/seanmozeik/yolomode/releases/download/v#{version}/yolomode-#{version}.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  depends_on "oven-sh/bun/bun"
  depends_on "socat"

  on_linux do
    depends_on "libsecret"
  end

  def install
    # Install all bundled files to libexec
    libexec.install Dir["*"]

    # Create wrapper script
    (bin/"yolomode").write <<~EOS
      #!/bin/bash
      exec "#{Formula["bun"].opt_bin}/bun" "#{libexec}/cli.js" "$@"
    EOS
  end

  test do
    assert_match "yolomode", shell_output("#{bin}/yolomode --help")
  end
end
