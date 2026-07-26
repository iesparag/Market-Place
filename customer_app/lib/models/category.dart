class CatNode {
  final String id;
  final String name;
  final String slug;
  final List<CatNode> children;
  CatNode({required this.id, required this.name, required this.slug, required this.children});

  factory CatNode.fromJson(Map<String, dynamic> j) => CatNode(
        id: (j['_id'] ?? '').toString(),
        name: j['name']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
        children: (j['children'] as List?)?.map((e) => CatNode.fromJson(e as Map<String, dynamic>)).toList() ?? [],
      );

  /// This slug + every descendant slug (so filtering a branch shows all its products).
  List<String> get allSlugs => [slug, ...children.expand((c) => c.allSlugs)];
}

class CategoryLite {
  final String name;
  final String slug;
  CategoryLite({required this.name, required this.slug});
  factory CategoryLite.fromJson(Map<String, dynamic> j) =>
      CategoryLite(name: j['name']?.toString() ?? '', slug: j['slug']?.toString() ?? '');
}
