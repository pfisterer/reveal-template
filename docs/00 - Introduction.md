<!-- .slide: data-state="hide-menubar" -->
<div class="lecturetitle">Introduction</div>

---
## Table of Contents
<!-- .slide: data-state="hide-menubar" -->

<ul class="menu"><ul>

---
## Code Example

```bash
# Create a Kafka cluster using the operator
kubectl apply -f https://raw.githubusercontent.com/strimzi/strimzi-kafka-operator/refs/heads/main/examples/kafka/kafka-ephemeral.yaml
```

```bash
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t yourusername/yourcontainername:1.2.3 -t yourusername/yourcontainername:latest --push .
```

```bash
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t yourusername/yourcontainername:1.2.3 -t yourusername/yourcontainername:latest --push .
```
<!-- .element: data-no-wrap -->

---
## Kafka Streams: Run It

<pre class="dirtree" data-zipname="bla.zip" style="margin-left: 40px;">
00 - Introduction.md
test-code.c
</pre>

<pre class="dirtree" style="margin-left: 40px;">
00 - Introduction.md
test-code.c
</pre>

---
## Mermaid Example

```mermaid
graph LR
    A["frontend<br/>0–120ms"] --> B["auth<br/>5–30ms"]
    A --> C["data<br/>35–115ms"]
    C --> D["database<br/>40–110ms"]
```

```mermaid
flowchart LR
  S(["Spout<br/>sentences"]) -->|sentence| SP["Bolt<br/>split"]
  SP -->|words| C["Bolt<br/>count"]
  C -->|"(word, count)"| OUT[/"Output"/]
```

Some text
- This is an example presentation
- This is an example presentation
- This is an example presentation

---
## Asciinema Example

<asciinema data-conf='{ "cols": 120, "rows": 25, "theme":"monokai", "autoPlay": true, "idleTimeLimit": 2, "terminalFontSize": "16px"}'
        src="k8s-deployment.cast" />


---
## Some Heading
<!-- .slide: data-name="Some Heading" -->

Some text
- This is an example presentation
- This is an example presentation
- This is an example presentation

Some text
- This is an example presentation
- This is an example presentation
- This is an example presentation

<credits>This is a test for the credits section.</credits>

---
## Next Heading
<!-- .slide: data-name="next-heading" -->

Some text
- This is an example presentation
- This is an example presentation
- This is an example presentation

Some text
- This is an example presentation
- This is an example presentation
- This is an example presentation


---
## Next Heading

Some text
- This is an example presentation
- This is an example presentation
- This is an example presentation

Some text
- This is an example presentation
- This is an example presentation
- This is an example presentation
