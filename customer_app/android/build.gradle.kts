allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

open class SubprojectFlutterExtension {
    var compileSdkVersion: Int = 34
    var minSdkVersion: Int = 21
    var targetSdkVersion: Int = 34
    var ndkVersion: String = "25.1.8937393"
}

subprojects {
    project.plugins.withId("com.android.library") {
        val android = project.extensions.findByType(com.android.build.gradle.LibraryExtension::class.java)
        android?.apply {
            compileSdk = 34
            val ext = this as? org.gradle.api.plugins.ExtensionAware
            if (ext?.extensions?.findByName("flutter") == null) {
                ext?.extensions?.create("flutter", SubprojectFlutterExtension::class.java)
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
