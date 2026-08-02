from setuptools import setup, find_packages

with open("README.md", encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="provenode-sdk",
    version="1.0.0",
    description="Python SDK for Provenode — verified AI model deployment on Shelby testnet",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Provenode",
    url="https://github.com/salch-cred/provenode",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=["requests>=2.28.0"],
    extras_require={"dev": ["pytest", "responses"]},
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
)
